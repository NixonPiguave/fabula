import { t } from '../shared/i18n'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, writeFile, copyFile, mkdir, stat, rm, lstat } from 'node:fs/promises'
import { join, basename, dirname, resolve } from 'node:path'
import { dialog, shell, type BrowserWindow } from 'electron'
import { z } from 'zod'
import { VOICES, type VoiceInfo, type JobRecord } from '../shared/types'
import { atomicJson, readJson } from './core/files'
import { command } from './core/process'

export const piperConfigSchema = z
  .object({
    audio: z.object({ sample_rate: z.number().int().min(8000).max(96000) }),
    espeak: z.object({
      voice: z
        .string()
        .min(1)
        .max(50)
        .regex(/^[a-zA-Z0-9_+-]+$/)
    }),
    num_speakers: z.number().int().min(1).max(10000),
    phoneme_id_map: z
      .record(z.string(), z.array(z.number().int().nonnegative()))
      .refine((value) => Object.keys(value).length > 0)
  })
  .passthrough()
const importedSchema = z.array(
  z.object({
    id: z.string().regex(/^piper:[a-f0-9]{64}$/),
    name: z.string().min(1).max(100),
    speaker: z.number().int().nonnegative(),
    locale: z.string().max(50),
    createdAt: z.iso.datetime()
  })
)
type Imported = z.infer<typeof importedSchema>[number]
export type VoiceRuntime =
  | {
      provider: 'sapi'
      id: string
      name: string
      locale: string
      architecture: 32 | 64
      powershell: string
      script: string
    }
  | {
      provider: 'piper'
      id: string
      model: string
      config: string
      speaker: number
      executable: string
    }
export function powershellPath(architecture: 32 | 64) {
  return join(
    process.env.SystemRoot || 'C:\\Windows',
    architecture === 32 ? 'SysWOW64' : 'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )
}
async function sha256(path: string) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(path)) hash.update(bytes)
  return hash.digest('hex')
}

export class VoiceRegistry {
  private imported: Imported[] = []
  private installed: (VoiceRuntime & { info: VoiceInfo })[] = []
  private pending = Promise.resolve()
  constructor(
    readonly root: string,
    readonly script: string,
    private modulePath: string,
    private changed: (voices: VoiceInfo[]) => void
  ) {}
  private folder(id: string) {
    if (!/^piper:[a-f0-9]{64}$/.test(id)) throw new Error(t('Voz importada inválida.'))
    return join(this.root, id.slice(6))
  }
  list(): VoiceInfo[] {
    return [
      ...VOICES,
      ...this.installed.map((voice) => voice.info),
      ...this.imported.map((voice) => ({
        id: voice.id,
        name: voice.name,
        locale: voice.locale,
        country: voice.locale,
        accent: t('Piper local'),
        gender: t('Voz importada'),
        color: 'teal',
        initials: voice.name.charAt(0).toUpperCase(),
        provider: 'piper' as const,
        description: t(
          'Modelo Piper importado · hablante {0}. Se procesa en tu equipo, sin conexión.',
          voice.speaker
        )
      }))
    ]
  }
  async load() {
    await mkdir(this.root, { recursive: true })
    try {
      this.imported = importedSchema.parse(await readJson(join(this.root, 'voices.json')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error(
          t(
            'No se pudo leer el registro de voces externas. Conserva voices.json antes de repararlo.'
          )
        )
    }
    await this.refresh()
  }
  async refresh() {
    const scanned = await Promise.allSettled(
      ([64, 32] as const).map(async (architecture) => {
        const request = join(this.root, `scan-${randomUUID()}.json`)
        try {
          await writeFile(request, JSON.stringify({ operation: 'list' }), 'utf8')
          const output = await command(
            powershellPath(architecture),
            [
              '-NoLogo',
              '-NoProfile',
              '-NonInteractive',
              '-ExecutionPolicy',
              'Bypass',
              '-File',
              this.script,
              '-RequestFile',
              request
            ],
            { signal: AbortSignal.timeout(20000) }
          )
          const entries = z
            .array(
              z.object({
                name: z.string().min(1).max(200),
                locale: z.string().max(50),
                gender: z.string()
              })
            )
            .parse(JSON.parse(output.replace(/^\uFEFF/, '').trim()))
          return entries.map((entry) => {
            const id =
              `sapi${architecture}:` +
              createHash('sha256')
                .update(`${architecture}:${entry.name}:${entry.locale}`)
                .digest('hex')
            const info: VoiceInfo = {
              id,
              name: entry.name + (architecture === 32 ? t(' · 32 bits') : ''),
              locale: entry.locale,
              country: entry.locale,
              accent: t('Windows SAPI · {0} bits', architecture),
              gender:
                entry.gender === 'Female'
                  ? t('Femenina')
                  : entry.gender === 'Male'
                    ? t('Masculina')
                    : t('Voz instalada'),
              color: 'amber',
              initials: entry.name.replace(/^Microsoft\s+/i, '').charAt(0),
              provider: 'sapi',
              description: t(
                'Voz instalada en Windows. Funciona sin conexión; su calidad depende del motor instalado.'
              )
            }
            return {
              provider: 'sapi' as const,
              id,
              name: entry.name,
              locale: entry.locale,
              architecture,
              powershell: powershellPath(architecture),
              script: this.script,
              info
            }
          })
        } finally {
          await rm(request, { force: true }).catch(() => {})
        }
      })
    )
    const all = scanned.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    this.installed = all.filter(
      (voice) =>
        voice.architecture === 64 ||
        !all.some(
          (other) =>
            other.architecture === 64 && other.name === voice.name && other.locale === voice.locale
        )
    )
    this.changed(this.list())
    return this.list()
  }
  runtime(job: Pick<JobRecord, 'settings' | 'blockOverrides'>): VoiceRuntime[] {
    const ids = new Set([
      job.settings.voice,
      ...Object.values(job.blockOverrides ?? {}).flatMap((value) =>
        value.voice ? [value.voice] : []
      )
    ])
    return [...ids].flatMap<VoiceRuntime>((id) => {
      if (VOICES.some((voice) => voice.id === id)) return []
      const installed = this.installed.find((voice) => voice.id === id)
      if (installed) return [installed]
      const imported = this.imported.find((voice) => voice.id === id)
      if (!imported)
        throw new Error(
          t('Una voz seleccionada ya no está disponible. Vuelve a importarla o elige otra voz.')
        )
      const folder = this.folder(id)
      return [
        {
          provider: 'piper' as const,
          id,
          model: join(folder, 'model.onnx'),
          config: join(folder, 'model.onnx.json'),
          speaker: imported.speaker,
          executable: join(this.modulePath, 'piper.exe')
        }
      ]
    })
  }
  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    const operation = this.pending.then(work)
    this.pending = operation.then(
      () => {},
      () => {}
    )
    return operation
  }
  async importVoice(window: BrowserWindow, raw: unknown) {
    const input = z
      .object({
        name: z.string().trim().max(100).optional(),
        speaker: z.number().int().min(0).max(9999).default(0)
      })
      .parse(raw)
    return this.exclusive(async () => {
      const chosen = await dialog.showOpenDialog(window, {
        buttonLabel: t('Abrir'),
        title: t('Importar una voz Piper (.onnx)'),
        properties: ['openFile'],
        filters: [{ name: t('Modelo Piper ONNX'), extensions: ['onnx'] }]
      })
      if (chosen.canceled) return null
      const model = chosen.filePaths[0],
        modelStat = await stat(model)
      if (
        !model.toLowerCase().endsWith('.onnx') ||
        !modelStat.isFile() ||
        modelStat.size < 1000 ||
        modelStat.size > 500 * 1024 * 1024
      )
        throw new Error(t('Selecciona un modelo Piper ONNX de hasta 500 MB.'))
      let configFile = model + '.json'
      try {
        await stat(configFile)
      } catch {
        const config = await dialog.showOpenDialog(window, {
          buttonLabel: t('Abrir'),
          title: t('Seleccionar la configuración .onnx.json de esta voz'),
          properties: ['openFile'],
          filters: [{ name: t('Configuración Piper'), extensions: ['json'] }]
        })
        if (config.canceled) return null
        configFile = config.filePaths[0]
      }
      if ((await stat(configFile)).size > 2 * 1024 * 1024)
        throw new Error(t('El archivo de configuración es demasiado grande.'))
      const configBytes = await readFile(configFile)
      let config: z.infer<typeof piperConfigSchema>
      try {
        config = piperConfigSchema.parse(JSON.parse(configBytes.toString('utf8')))
      } catch {
        throw new Error(
          t(
            'El JSON no es una configuración Piper compatible. Selecciona el archivo .onnx.json que acompaña a este modelo.'
          )
        )
      }
      if (input.speaker >= config.num_speakers)
        throw new Error(
          t(
            'Esta voz tiene {0} hablantes. Elige un índice desde 0 hasta {1}.',
            config.num_speakers,
            config.num_speakers - 1
          )
        )
      const digest = createHash('sha256')
          .update(await sha256(model))
          .update(configBytes)
          .update(String(input.speaker))
          .digest('hex'),
        id = `piper:${digest}`
      if (this.imported.some((voice) => voice.id === id))
        throw new Error(t('Este modelo y hablante ya están importados.'))
      const folder = this.folder(id)
      await mkdir(folder, { recursive: true })
      await copyFile(model, join(folder, 'model.onnx'))
      await writeFile(join(folder, 'model.onnx.json'), configBytes)
      const card = join(dirname(model), 'MODEL_CARD')
      try {
        if ((await stat(card)).size < 1024 * 1024) await copyFile(card, join(folder, 'MODEL_CARD'))
      } catch {}
      const entry: Imported = {
        id,
        name: input.name || basename(model, '.onnx').slice(0, 100),
        speaker: input.speaker,
        locale: config.espeak.voice,
        createdAt: new Date().toISOString()
      }
      const next = [...this.imported, entry]
      await atomicJson(join(this.root, 'voices.json'), next)
      this.imported = next
      this.changed(this.list())
      return this.list()
    })
  }
  async remove(window: BrowserWindow, id: string) {
    return this.exclusive(async () => {
      const voice = this.imported.find((voice) => voice.id === id)
      if (!voice)
        throw new Error(t('Solo se pueden retirar modelos Piper importados desde Fábula.'))
      const answer = await dialog.showMessageBox(window, {
        type: 'question',
        title: t('Retirar voz importada'),
        message: t('¿Retirar «{0}»?', voice.name),
        detail: t(
          'Los audios generados se conservan. Para generar o reanudar con esta voz tendrás que importarla de nuevo. Su carpeta se moverá a la Papelera de Windows.'
        ),
        buttons: [t('Cancelar'), t('Retirar voz')],
        defaultId: 0,
        cancelId: 0
      })
      if (answer.response !== 1) return false
      const folder = resolve(this.folder(id))
      if (dirname(folder) !== resolve(this.root) || (await lstat(folder)).isSymbolicLink())
        throw new Error(t('Ruta de voz no válida.'))
      await shell.trashItem(folder)
      const next = this.imported.filter((voice) => voice.id !== id)
      await atomicJson(join(this.root, 'voices.json'), next)
      this.imported = next
      this.changed(this.list())
      return true
    })
  }
  async close() {
    await this.pending
  }
}
