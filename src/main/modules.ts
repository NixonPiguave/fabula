import { t } from '../shared/i18n'
import { mkdir, readFile, writeFile, rename, stat, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { join, basename, dirname, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { unzipSync } from 'fflate'
import { atomicJson } from './core/files'
import type { ModuleKind, ModuleState } from '../shared/studio'

export const MODULE_ASSETS = {
  piper: [
    {
      name: 'piper.zip',
      size: 22477236,
      url: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip',
      sha256: 'f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea'
    }
  ],
  ocr: [
    {
      name: 'spa.traineddata',
      size: 2294433,
      url: 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/spa.traineddata',
      sha256: '6f2e04d02774a18f01bed44b1111f2cd7f3ba7ac9dc4373cd3f898a40ea6b464'
    }
  ],
  transcription: [
    {
      name: 'runtime.zip',
      size: 8928640,
      url: 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip',
      sha256: '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb'
    },
    {
      name: 'ggml-base.bin',
      size: 147951465,
      url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
      sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe'
    }
  ]
} as const
const VERSIONS = {
  ocr: 'spa-fast-4.1.0',
  transcription: 'whisper-b5454-base-v1',
  piper: 'piper-2023.11.14-2'
}

export class ModuleManager {
  private state: ModuleState[] = (['ocr', 'transcription', 'piper'] as const).map((kind) => ({
    kind,
    installed: false,
    status: 'idle',
    progress: 0
  }))
  private controller: AbortController | null = null
  constructor(
    readonly root: string,
    private changed: (state: ModuleState) => void
  ) {}
  path(kind: ModuleKind) {
    return join(this.root, kind)
  }
  states() {
    return structuredClone(this.state)
  }
  ready(kind: ModuleKind) {
    return this.state.find((state) => state.kind === kind)!.installed
  }
  private update(kind: ModuleKind, values: Partial<ModuleState>) {
    const state = this.state.find((state) => state.kind === kind)!
    Object.assign(state, values)
    this.changed({ ...state })
  }
  async load() {
    for (const kind of ['ocr', 'transcription', 'piper'] as const) {
      try {
        const marker = JSON.parse(await readFile(join(this.path(kind), 'ready.json'), 'utf8'))
        if (marker.version !== VERSIONS[kind]) continue
        for (const [name, expected] of Object.entries(
          marker.files as Record<string, { size: number }>
        )) {
          if (
            !resolve(this.path(kind), name).startsWith(resolve(this.path(kind)) + sep) ||
            (await stat(join(this.path(kind), name))).size !== expected.size
          )
            throw new Error(t('Incomplete module'))
        }
        // Explicit required files prevent an empty or stale marker from appearing installed.
        await stat(
          join(
            this.path(kind),
            kind === 'ocr' ? 'spa.traineddata' : kind === 'piper' ? 'piper.exe' : 'whisper-cli.exe'
          )
        )
        if (kind === 'transcription') await stat(join(this.path(kind), 'ggml-base.bin'))
        this.update(kind, { installed: true, status: 'ready', progress: 1 })
      } catch {
        /* Missing/partial downloads remain available for retry. */
      }
    }
  }
  cancel() {
    this.controller?.abort()
  }
  async install(kind: ModuleKind) {
    if (this.controller) throw new Error(t('Ya hay una descarga en curso.'))
    if (kind !== 'ocr' && (process.platform !== 'win32' || process.arch !== 'x64'))
      throw new Error(t('Este módulo está preparado para Windows de 64 bits.'))
    this.controller = new AbortController()
    const signal = this.controller.signal,
      folder = this.path(kind),
      files: Record<string, { size: number }> = {}
    const assets = MODULE_ASSETS[kind],
      total = assets.reduce((sum, asset) => sum + asset.size, 0)
    let completed = 0
    try {
      await mkdir(folder, { recursive: true })
      this.update(kind, { installed: false, status: 'downloading', progress: 0, error: undefined })
      for (const asset of assets) {
        const target = join(folder, asset.name),
          temp = `${target}.part`
        let cached = false
        try {
          cached =
            createHash('sha256')
              .update(await readFile(target))
              .digest('hex') === asset.sha256
        } catch {}
        if (!cached) {
          const response = await fetch(asset.url, { signal })
          if (!response.ok || !response.body)
            throw new Error(t('La descarga respondió HTTP {0}.', response.status))
          const hash = createHash('sha256')
          let received = 0,
            lastUpdate = 0
          const meter = new Transform({
            transform: (bytes, _encoding, callback) => {
              received += bytes.length
              if (received > asset.size) {
                callback(new Error(t('La descarga tiene un tamaño inesperado.')))
                return
              }
              hash.update(bytes)
              if (Date.now() - lastUpdate > 150) {
                lastUpdate = Date.now()
                this.update(kind, { progress: (completed + received) / total })
              }
              callback(null, bytes)
            }
          })
          await pipeline(Readable.fromWeb(response.body as any), meter, createWriteStream(temp), {
            signal
          })
          this.update(kind, { status: 'verifying' })
          if (received !== asset.size || hash.digest('hex') !== asset.sha256) {
            await rm(temp, { force: true })
            throw new Error(t('La verificación de integridad falló. Se descartó la descarga.'))
          }
          await rename(temp, target)
        }
        if (asset.name === 'piper.zip') {
          const entries = unzipSync(await readFile(target))
          for (const [name, bytes] of Object.entries(entries)) {
            if (name.endsWith('/')) continue
            const relative = name.replace(/^piper\//, '')
            if (
              !/^(?:piper\.exe|[a-zA-Z0-9_-]+\.dll|libtashkeel_model\.ort|espeak-ng-data\/[a-zA-Z0-9_+.!@/-]+)$/.test(
                relative
              )
            )
              continue
            const output = resolve(folder, relative)
            if (!output.startsWith(resolve(folder) + sep))
              throw new Error(t('El módulo contiene una ruta inválida.'))
            await mkdir(dirname(output), { recursive: true })
            await writeFile(output, bytes)
            files[relative] = { size: bytes.length }
          }
          if (!files['piper.exe'] || !files['onnxruntime.dll'] || !files['espeak-ng.dll'])
            throw new Error(t('El motor Piper está incompleto.'))
        } else if (asset.name === 'runtime.zip') {
          const entries = unzipSync(await readFile(target))
          for (const [name, bytes] of Object.entries(entries)) {
            const file = basename(name)
            if (
              !/^(?:whisper-cli\.exe|whisper\.dll|ggml(?:-base|-cpu-[a-z0-9]+)?\.dll)$/i.test(file)
            )
              continue
            await writeFile(join(folder, file), bytes)
            files[file] = { size: bytes.length }
          }
          if (!files['whisper-cli.exe'] || !files['whisper.dll'] || !files['ggml.dll'])
            throw new Error(t('El runtime descargado está incompleto.'))
        } else files[asset.name] = { size: asset.size }
        completed += asset.size
        this.update(kind, { status: 'downloading', progress: completed / total })
      }
      await atomicJson(join(folder, 'ready.json'), { version: VERSIONS[kind], files })
      this.update(kind, { installed: true, status: 'ready', progress: 1 })
    } catch (error) {
      const message = signal.aborted
        ? t('Descarga cancelada. Puedes volver a iniciarla.')
        : error instanceof Error
          ? error.message
          : String(error)
      this.update(kind, { installed: false, status: 'failed', error: message })
      throw new Error(message)
    } finally {
      this.controller = null
    }
  }
}
