import { dialog, type BrowserWindow } from 'electron'
import { mkdir, writeFile, readdir } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Worker } from 'node:worker_threads'
import { z } from 'zod'
import { Document, Packer, Paragraph } from 'docx'
import { ModuleManager } from './modules'
import { atomicJson, readJson, safeName } from './core/files'
import {
  preferencesSchema,
  DEFAULT_PREFERENCES,
  type PlaybackState,
  type Transcript,
  type TaskProgress
} from '../shared/studio'

export const playbackSchema = z.object({
  currentId: z.uuid().nullable(),
  positions: z.record(z.uuid(), z.number().finite().nonnegative()),
  bookmarks: z.record(
    z.uuid(),
    z
      .array(
        z.object({
          id: z.uuid(),
          label: z.string().min(1).max(100),
          seconds: z.number().finite().nonnegative()
        })
      )
      .max(1000)
  )
})
const transcriptSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(160),
  text: z.string(),
  createdAt: z.iso.datetime(),
  segments: z.array(
    z
      .object({
        start: z.number().finite().nonnegative(),
        end: z.number().finite().nonnegative(),
        text: z.string()
      })
      .refine((value) => value.end >= value.start)
  )
})
const languages = z.enum(['auto', 'es', 'en', 'pt', 'fr', 'it', 'de', 'ja'])
const extensions = [
  'pdf',
  'txt',
  'md',
  'docx',
  'epub',
  'html',
  'htm',
  'odt',
  'rtf',
  'png',
  'jpg',
  'jpeg',
  'tif',
  'tiff',
  'webp',
  'bmp'
]
export function subtitleText(transcript: Transcript, format: 'srt' | 'vtt') {
  function stamp(seconds: number) {
    const ms = Math.round(seconds * 1000),
      h = Math.floor(ms / 3600000),
      m = Math.floor(ms / 60000) % 60,
      s = Math.floor(ms / 1000) % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${format === 'srt' ? ',' : '.'}${String(ms % 1000).padStart(3, '0')}`
  }
  return (
    (format === 'vtt' ? 'WEBVTT\n\n' : '') +
    transcript.segments
      .map(
        (segment, index) =>
          `${format === 'srt' ? `${index + 1}\n` : ''}${stamp(segment.start)} --> ${stamp(segment.end)}\n${segment.text.replace(/\r?\n\s*\r?\n/g, '\n')}\n`
      )
      .join('\n')
  )
}
export class Features {
  preferences = structuredClone(DEFAULT_PREFERENCES)
  playback: PlaybackState = { currentId: null, positions: {}, bookmarks: {} }
  transcripts: Transcript[] = []
  readonly modules: ModuleManager
  private writes = Promise.resolve()
  private task: {
    worker: Worker
    pid?: number
    reject: (error: Error) => void
    kind: TaskProgress['kind']
    cancelled: boolean
  } | null = null
  microphoneUntil = 0
  constructor(
    readonly root: string,
    private here: string,
    private window: () => BrowserWindow | null,
    private ffmpeg: string
  ) {
    this.modules = new ModuleManager(join(root, 'modules'), (state) =>
      this.send('module:changed', state)
    )
  }
  private send(channel: string, value: unknown) {
    const win = this.window()
    if (win && !win.isDestroyed()) win.webContents.send(channel, value)
  }
  private persist(name: string, value: unknown) {
    this.writes = this.writes.catch(() => {}).then(() => atomicJson(join(this.root, name), value))
    return this.writes
  }
  async load() {
    try {
      this.preferences = preferencesSchema.parse(
        await readJson(join(this.root, 'preferences.json'))
      )
    } catch {}
    try {
      this.playback = playbackSchema.parse(await readJson(join(this.root, 'playback.json')))
    } catch {}
    await this.modules.load()
    const ids = await readdir(join(this.root, 'transcriptions')).catch(() => [])
    for (const id of ids) {
      if (!z.uuid().safeParse(id).success) continue
      try {
        this.transcripts.push(
          transcriptSchema.parse(
            await readJson(join(this.root, 'transcriptions', id, 'transcript.json'))
          )
        )
      } catch {}
    }
    this.transcripts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  private async workerTask(kind: TaskProgress['kind'], file: string, data: unknown): Promise<any> {
    if (this.task)
      throw new Error('Hay una importación o transcripción en curso. Espera o cancélala primero.')
    return new Promise((resolve, reject) => {
      const worker = new Worker(join(this.here, file), { workerData: data })
      const task = { worker, reject, kind, cancelled: false, pid: undefined as number | undefined }
      this.task = task
      this.send('task:changed', { kind, phase: 'Preparando…', progress: 0, status: 'running' })
      let settled = false
      const finish = (error: Error | null, result?: unknown) => {
        if (settled || task.cancelled) return
        settled = true
        if (this.task === task) this.task = null
        this.send('task:changed', {
          kind,
          phase: error ? 'No se pudo completar' : 'Completado',
          progress: error ? 0 : 1,
          status: error ? 'failed' : 'completed',
          error: error?.message
        })
        error ? reject(error) : resolve(result)
      }
      worker.on('message', (message) => {
        if (task.cancelled) return
        if ('encoderPid' in message) {
          task.pid = message.encoderPid
          return
        }
        if (message.kind === 'progress')
          this.send('task:changed', {
            kind,
            phase: message.phase,
            progress: message.progress,
            status: 'running'
          })
        if (message.kind === 'result') finish(null, message)
        if (message.kind === 'error') finish(new Error(message.error))
      })
      worker.once('error', (error) =>
        finish(error instanceof Error ? error : new Error(String(error)))
      )
      worker.once('exit', (code) => {
        if (!settled)
          finish(new Error(`El proceso terminó antes de completar la operación (${code}).`))
      })
    })
  }
  async cancelTask() {
    const task = this.task
    if (!task) return
    task.cancelled = true
    this.task = null
    if (task.pid) {
      try {
        process.kill(task.pid)
      } catch {}
    }
    await task.worker.terminate()
    task.reject(new Error('Operación cancelada.'))
    this.send('task:changed', {
      kind: task.kind,
      phase: 'Cancelado',
      progress: 0,
      status: 'cancelled'
    })
  }
  async close() {
    this.modules.cancel()
    await this.cancelTask()
    await this.writes
  }
  async forgetJob(id: string) {
    delete this.playback.positions[id]
    delete this.playback.bookmarks[id]
    if (this.playback.currentId === id) this.playback.currentId = null
    await this.persist('playback.json', structuredClone(this.playback))
  }
  register(handle: (channel: string, callback: (...args: any[]) => unknown) => void) {
    handle('preferences:save', (value: unknown) => {
      this.preferences = preferencesSchema.parse(value)
      return this.persist('preferences.json', this.preferences)
    })
    handle('playback:save', (value: unknown) => {
      this.playback = playbackSchema.parse(value)
      return this.persist('playback.json', this.playback)
    })
    handle('transcription:save', (value: unknown) => {
      const transcript = transcriptSchema.parse(value)
      transcript.text = transcript.segments.map((segment) => segment.text).join('\n')
      this.transcripts = [
        transcript,
        ...this.transcripts.filter((item) => item.id !== transcript.id)
      ]
      return this.persist(`transcriptions/${transcript.id}/transcript.json`, transcript)
    })
    handle('preferences:export-folder', async () => {
      const result = await dialog.showOpenDialog(this.window()!, {
        title: 'Carpeta de exportación predeterminada',
        properties: ['openDirectory', 'createDirectory']
      })
      return result.canceled ? null : result.filePaths[0]
    })
    handle('module:install', (value: unknown) =>
      this.modules.install(z.enum(['ocr', 'transcription', 'piper']).parse(value))
    )
    handle('module:cancel', () => this.modules.cancel())
    handle('task:cancel', () => this.cancelTask())
    handle('recording:allow', () => {
      this.microphoneUntil = Date.now() + 15000
      return true
    })
    handle('document:import', async (raw: unknown = {}) => {
      const options = z.object({ ocr: z.boolean().optional() }).parse(raw)
      if (this.task) throw new Error('Ya hay una operación en curso.')
      if (options.ocr && !this.modules.ready('ocr'))
        throw new Error('Instala primero el módulo OCR en Preferencias.')
      const result = await dialog.showOpenDialog(this.window()!, {
        title: options.ocr ? 'Importar con OCR' : 'Importar una historia',
        properties: ['openFile'],
        filters: [{ name: 'Documentos e imágenes', extensions }]
      })
      if (result.canceled) return null
      const path = result.filePaths[0],
        extension = extname(path).slice(1).toLowerCase()
      if (!extensions.includes(extension)) throw new Error('Formato no admitido.')
      const output = await this.workerTask('import', 'import-worker.js', {
        path,
        ocrPath: this.modules.ready('ocr') ? this.modules.path('ocr') : undefined
      })
      return {
        text: output.text,
        pages: output.pages,
        pdf: output.pdf,
        title: basename(path, extname(path)).slice(0, 160)
      }
    })
    const transcribe = async (path: string, language: string) => {
      if (!this.modules.ready('transcription'))
        throw new Error('Instala el módulo Voz a texto en Preferencias.')
      const id = randomUUID(),
        dir = join(this.root, 'transcriptions', id)
      await mkdir(dir, { recursive: true })
      const output = await this.workerTask('transcription', 'transcription-worker.js', {
        id,
        path,
        dir,
        modulePath: this.modules.path('transcription'),
        ffmpeg: this.ffmpeg,
        language
      })
      await atomicJson(join(dir, 'transcript.json'), output.transcript)
      this.transcripts.unshift(output.transcript)
      return output.transcript as Transcript
    }
    handle('transcription:file', async (raw: unknown) => {
      const language = languages.parse(raw)
      if (this.task) throw new Error('Ya hay una operación en curso.')
      if (!this.modules.ready('transcription'))
        throw new Error('Instala el módulo Voz a texto en Preferencias.')
      const result = await dialog.showOpenDialog(this.window()!, {
        title: 'Transcribir audio o video',
        properties: ['openFile'],
        filters: [
          {
            name: 'Audio y video',
            extensions: ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'mp4', 'webm', 'mkv']
          }
        ]
      })
      return result.canceled ? null : transcribe(result.filePaths[0], language)
    })
    handle('transcription:recording', async (raw: unknown, rawLanguage: unknown) => {
      const language = languages.parse(rawLanguage)
      if (!(raw instanceof Uint8Array) || !raw.byteLength || raw.byteLength > 100 * 1024 * 1024)
        throw new Error(
          'La grabación está vacía o supera 100 MB. Importa grabaciones largas como archivo.'
        )
      if (!this.modules.ready('transcription'))
        throw new Error('Instala el módulo Voz a texto en Preferencias.')
      const dir = join(this.root, 'recordings')
      await mkdir(dir, { recursive: true })
      const path = join(dir, `Dictado-${randomUUID()}.webm`)
      await writeFile(path, raw)
      return transcribe(path, language)
    })
    handle('transcription:export', async (raw: unknown, rawFormat: unknown) => {
      const transcript = transcriptSchema.parse(raw),
        format = z.enum(['txt', 'docx', 'srt', 'vtt']).parse(rawFormat)
      const title = safeName(transcript.title)
      const result = await dialog.showSaveDialog(this.window()!, {
        title: 'Exportar transcripción',
        defaultPath: join(this.preferences.exportFolder, `${title}.${format}`),
        filters: [{ name: format.toUpperCase(), extensions: [format] }]
      })
      if (result.canceled || !result.filePath) return null
      const text = transcript.segments.map((segment) => segment.text).join('\n\n')
      const bytes =
        format === 'docx'
          ? await Packer.toBuffer(
              new Document({
                sections: [
                  {
                    children: [
                      new Paragraph({ text: transcript.title, heading: 'Heading1' }),
                      ...transcript.segments.map((segment) => new Paragraph(segment.text))
                    ]
                  }
                ]
              })
            )
          : format === 'txt'
            ? text
            : subtitleText(transcript, format)
      await writeFile(result.filePath, bytes)
      return result.filePath
    })
  }
}
