import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  shell,
  type IpcMainInvokeEvent
} from 'electron'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, readdir, copyFile, stat, lstat } from 'node:fs/promises'
import { z } from 'zod'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { Worker } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import ffmpegPath from 'ffmpeg-static'
import { atomicJson, readJson } from './core/files'
import { normalizeText } from './core/text'
import { parseRange } from './core/range'
import { draftSchema, idSchema, startSchema } from '../shared/validation'
import { DEFAULT_SETTINGS, summary, type Draft, type JobRecord } from '../shared/types'
import { Features } from './features'
import { safeName } from './core/files'
import { ProjectStore } from './projects'
import { VoiceRegistry } from './voices'

const here = dirname(fileURLToPath(import.meta.url))
app.setName('Fábula')
if (process.env.FABULA_DATA_DIR) app.setPath('userData', process.env.FABULA_DATA_DIR)
const root = app.getPath('userData')
if (process.env.FABULA_TEST_MODE !== '1' && !app.requestSingleInstanceLock()) app.exit(0)
const jobsRoot = join(root, 'narrations')
let win: BrowserWindow | null = null
let active: { id: string; worker: Worker; encoderPid?: number } | null = null
let quitting = false
let creating = false
const jobs = new Map<string, JobRecord>()
const deleting = new Set<string>()
const projects = new ProjectStore(join(root, 'library.json'), (value) => {
  if (win && !win.isDestroyed()) win.webContents.send('library:changed', value)
})
const warnings: string[] = []
let draft: Draft = { title: 'Mi nueva historia', text: '', settings: { ...DEFAULT_SETTINGS } }
let draftWrites = Promise.resolve()
let draftTimer: ReturnType<typeof setTimeout> | undefined
let draftWaiters: { resolve: () => void; reject: (error: unknown) => void }[] = []
const features = new Features(
  root,
  here,
  () => win,
  (ffmpegPath ?? '').replace('app.asar', 'app.asar.unpacked')
)
const voices = new VoiceRegistry(
  join(root, 'voices'),
  join(here, '../../assets/native/sapi.ps1').replace('app.asar', 'app.asar.unpacked'),
  features.modules.path('piper'),
  (catalogue) => {
    if (win && !win.isDestroyed()) win.webContents.send('voices:changed', catalogue)
  }
)
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
})

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'fabula-audio',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])

function jobPath(id: string) {
  return join(jobsRoot, id, 'job.json')
}
function emit(job: JobRecord) {
  jobs.set(job.id, job)
  if (win && !win.isDestroyed()) win.webContents.send('job:changed', summary(job))
}
function assertSender(event: IpcMainInvokeEvent) {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
    throw new Error('Solicitud no permitida.')
}
function handle(channel: string, fn: (...args: any[]) => unknown) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertSender(event)
    return fn(...args)
  })
}
function getJob(rawId: unknown) {
  const id = idSchema.parse(rawId)
  const job = jobs.get(id)
  if (!job) throw new Error('No se encontró la narración.')
  if (deleting.has(id)) throw new Error('La narración se está moviendo a la Papelera.')
  return job
}
function flushDraft() {
  clearTimeout(draftTimer)
  draftTimer = undefined
  if (!draftWaiters.length) return draftWrites
  const snapshot = structuredClone(draft),
    waiting = draftWaiters
  draftWaiters = []
  draftWrites = draftWrites
    .catch(() => {})
    .then(() => atomicJson(join(root, 'draft.json'), snapshot))
  draftWrites.then(
    () => waiting.forEach((waiter) => waiter.resolve()),
    (error) => waiting.forEach((waiter) => waiter.reject(error))
  )
  return draftWrites
}

async function load() {
  await mkdir(jobsRoot, { recursive: true })
  await features.load()
  await voices.load()
  try {
    await projects.load()
  } catch {
    warnings.push('No se pudo leer la organización por proyectos. El archivo original se conserva.')
    throw new Error(
      'No se pudo leer library.json. Conserva el archivo antes de intentar repararlo.'
    )
  }
  try {
    draft = draftSchema.parse(await readJson(join(root, 'draft.json')))
  } catch {
    /* First launch has no draft. */
  }
  for (const id of await readdir(jobsRoot)) {
    if (!idSchema.safeParse(id).success) continue
    try {
      const raw = (await readJson(jobPath(id))) as JobRecord
      const parsed = startSchema.parse(raw)
      if (
        raw.id !== id ||
        ![1, 2].includes(raw.chunkVersion) ||
        !['generating', 'merging', 'completed', 'cancelled', 'failed', 'interrupted'].includes(
          raw.status
        )
      )
        throw new Error('Invalid manifest')
      const job: JobRecord = { ...raw, ...parsed, preview: !!raw.preview }
      if (['generating', 'merging'].includes(job.status)) {
        job.status = 'interrupted'
        job.error = 'La aplicación se cerró antes de terminar. Puedes reanudar la narración.'
        await atomicJson(jobPath(id), job)
      }
      if (job.status === 'completed') await stat(join(jobsRoot, id, 'narration.mp3'))
      jobs.set(id, job)
    } catch {
      warnings.push(
        `No se pudo cargar una narración guardada (${id.slice(0, 8)}). Sus archivos siguen en el disco.`
      )
    }
  }
}

function voiceSources(job: Pick<JobRecord, 'settings' | 'blockOverrides'>) {
  const sources = voices.runtime(job)
  if (sources.some((voice) => voice.provider === 'piper') && !features.modules.ready('piper'))
    throw new Error('Instala el motor Piper desde Explorar voces para usar modelos importados.')
  return sources
}
function run(job: JobRecord) {
  if (active) throw new Error('Ya hay una narración en curso. Espera a que termine o cancélala.')
  if (!ffmpegPath) throw new Error('No se encontró el codificador MP3.')
  const worker = new Worker(
    join(here, job.chunkVersion === 2 ? 'narration-worker.js' : 'speech-worker.js'),
    {
      workerData: {
        job,
        dir: join(jobsRoot, job.id),
        cache: join(root, 'audio-cache'),
        voices: voiceSources(job),
        ffmpeg: ffmpegPath.replace('app.asar', 'app.asar.unpacked')
      }
    }
  )
  active = { id: job.id, worker }
  worker.on('message', (message: JobRecord | { encoderPid: number }) => {
    if ('encoderPid' in message) {
      if (active?.id === job.id) active.encoderPid = message.encoderPid
      return
    }
    emit(message)
  })
  worker.once('error', async (error) => {
    const current = jobs.get(job.id)!
    current.status = 'failed'
    current.error = error instanceof Error ? error.message : String(error)
    await atomicJson(jobPath(job.id), current)
    emit(current)
  })
  worker.once('exit', async () => {
    if (active?.worker !== worker) return
    active = null
    const current = jobs.get(job.id)!
    if (current.status === 'generating' || current.status === 'merging') {
      current.status = 'interrupted'
      current.error = 'El proceso terminó antes de completar el audio. Puedes reanudarlo.'
      await atomicJson(jobPath(job.id), current)
      emit(current)
    }
  })
}

async function stop(status: 'cancelled' | 'interrupted') {
  if (!active) return
  const running = active
  active = null
  if (running.encoderPid) {
    try {
      process.kill(running.encoderPid)
    } catch {
      /* Encoder may have completed. */
    }
  }
  await running.worker.terminate()
  const job = (await readJson(jobPath(running.id)).catch(() => jobs.get(running.id))) as JobRecord
  if (job.status !== 'completed') {
    job.status = status
    job.error = undefined
    await atomicJson(jobPath(job.id), job)
  }
  emit(job)
}

function registerIpc() {
  features.register(handle)
  handle('app:boot', () => ({
    draft,
    jobs: [...jobs.values()].map(summary).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    warnings,
    voices: voices.list(),
    library: projects.snapshot(),
    preferences: features.preferences,
    playback: features.playback,
    modules: features.modules.states(),
    transcripts: features.transcripts
  }))
  handle('voices:refresh', () => voices.refresh())
  handle('voices:import', (input: unknown) => voices.importVoice(win!, input))
  handle('voices:remove', (raw: unknown) => {
    const id = z
      .string()
      .regex(/^piper:[a-f0-9]{64}$/)
      .parse(raw)
    const job = active ? jobs.get(active.id) : null
    if (
      job &&
      (job.settings.voice === id ||
        Object.values(job.blockOverrides ?? {}).some((value) => value.voice === id))
    )
      throw new Error('Espera a que termine la narración antes de retirar esta voz.')
    return voices.remove(win!, id)
  })
  handle('project:save', (input: unknown) => projects.save(input))
  handle('project:assign', (rawId: unknown, rawProject: unknown) => {
    const job = getJob(rawId)
    return projects.assign(job.id, z.uuid().nullable().parse(rawProject))
  })
  handle('project:delete', async (rawId: unknown) => {
    const id = idSchema.parse(rawId),
      project = projects.snapshot().projects.find((item) => item.id === id)
    if (!project) throw new Error('El proyecto ya no existe.')
    const answer = await dialog.showMessageBox(win!, {
      type: 'question',
      title: 'Eliminar proyecto',
      message: `¿Eliminar el proyecto «${project.name}»?`,
      detail: 'Sus narraciones se conservarán en la biblioteca, sin proyecto.',
      buttons: ['Cancelar', 'Eliminar proyecto'],
      defaultId: 0,
      cancelId: 0
    })
    if (answer.response !== 1) return false
    await projects.remove(id)
    if (draft.projectId === id) {
      draft = { ...draft, projectId: null }
      const snapshot = structuredClone(draft)
      draftWrites = draftWrites
        .catch(() => {})
        .then(() => atomicJson(join(root, 'draft.json'), snapshot))
      await draftWrites
    }
    return true
  })
  handle('job:delete', async (rawId: unknown) => {
    const job = getJob(rawId)
    if (active?.id === job.id || ['generating', 'merging'].includes(job.status))
      throw new Error('Cancela la narración en curso antes de borrarla.')
    deleting.add(job.id)
    try {
      const answer = await dialog.showMessageBox(win!, {
        type: 'warning',
        title: 'Borrar narración',
        message: `¿Mover «${job.title}» a la Papelera de reciclaje?`,
        detail:
          'Se quitará de Fábula junto con su texto y audio guardados. Los MP3 que hayas exportado se conservan. Puedes recuperar la carpeta desde la Papelera de Windows con Fábula cerrada.',
        buttons: ['Cancelar', 'Mover a la Papelera'],
        defaultId: 0,
        cancelId: 0
      })
      if (answer.response !== 1) return false
      const folder = resolve(jobsRoot, job.id)
      if (dirname(folder) !== resolve(jobsRoot) || (await lstat(folder)).isSymbolicLink())
        throw new Error('La ubicación de la narración no es válida.')
      await shell.trashItem(folder)
      jobs.delete(job.id)
      if (win && !win.isDestroyed()) win.webContents.send('job:removed', job.id)
      // Membership is retained so restoring the folder from Windows also restores its project.
      await features.forgetJob(job.id).catch(() => {
        warnings.push('No se pudo limpiar la posición de una narración borrada.')
      })
      return true
    } finally {
      deleting.delete(job.id)
    }
  })
  handle('draft:save', (input: unknown) => {
    draft = draftSchema.parse(input)
    clearTimeout(draftTimer)
    const saved = new Promise<void>((resolve, reject) => draftWaiters.push({ resolve, reject }))
    draftTimer = setTimeout(() => {
      flushDraft().catch(() => {})
    }, 300)
    return saved
  })
  handle('job:start', async (input: unknown) => {
    if (active || creating) throw new Error('Ya hay una narración en curso.')
    creating = true
    try {
      const parsed = startSchema.parse(input)
      voiceSources(parsed)
      projects.requireProject(parsed.projectId)
      const text = parsed.text.replace(/\r\n?/g, '\n')
      if (!normalizeText(text))
        throw new Error('El texto no contiene contenido que se pueda narrar.')
      const job: JobRecord = {
        id: randomUUID(),
        title: parsed.title,
        text,
        settings: parsed.settings,
        preview: !!parsed.preview,
        pauseMs: parsed.pauseMs ?? 350,
        blockOverrides: parsed.blockOverrides ?? {},
        pronunciations: structuredClone(features.preferences.pronunciations),
        status: 'generating',
        completedChunks: 0,
        totalChunks: 0,
        createdAt: new Date().toISOString(),
        words: text.trim().split(/\s+/u).length,
        characters: text.length,
        chunkVersion: 2
      }
      if (parsed.projectId && !parsed.preview) await projects.assign(job.id, parsed.projectId)
      await atomicJson(jobPath(job.id), job)
      jobs.set(job.id, job)
      run(job)
      return summary(job)
    } finally {
      creating = false
    }
  })
  handle('job:cancel', async (id: unknown) => {
    const job = getJob(id)
    if (active?.id === job.id) await stop('cancelled')
  })
  handle('job:resume', async (id: unknown) => {
    const job = getJob(id)
    voiceSources(job)
    if (!['cancelled', 'failed', 'interrupted'].includes(job.status))
      throw new Error('Esta narración no necesita reanudarse.')
    if (active || creating) throw new Error('Ya hay una narración en curso.')
    creating = true
    try {
      job.status = 'generating'
      job.error = undefined
      await atomicJson(jobPath(job.id), job)
      emit(job)
      run(job)
    } finally {
      creating = false
    }
  })
  handle('job:open', (id: unknown) => {
    const job = getJob(id)
    return {
      title: job.title,
      text: job.text,
      settings: job.settings,
      pauseMs: job.pauseMs,
      blockOverrides: job.blockOverrides,
      projectId: projects.snapshot().assignments[job.id] ?? null
    }
  })
  handle('job:export-chapters', async (id: unknown) => {
    const job = getJob(id)
    if (job.status !== 'completed' || !job.chapters?.length)
      throw new Error('Genera la narración con capítulos primero.')
    const result = await dialog.showOpenDialog(win!, {
      title: 'Guardar MP3 por capítulos',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled) return null
    const folder = join(result.filePaths[0], `${safeName(job.title)}-${job.id.slice(0, 8)}`)
    await mkdir(folder, { recursive: true })
    for (let index = 0; index < job.chapters.length; index++) {
      const chapter = job.chapters[index]
      if (!/^chapter-\d+\.mp3$/.test(chapter.file)) throw new Error('Archivo de capítulo inválido.')
      await copyFile(
        join(jobsRoot, job.id, chapter.file),
        join(folder, `${String(index + 1).padStart(3, '0')} - ${safeName(chapter.title)}.mp3`)
      )
    }
    return folder
  })
  handle('job:export', async (id: unknown) => {
    const job = getJob(id)
    if (job.status !== 'completed') throw new Error('Primero termina de generar la narración.')
    const result = await dialog.showSaveDialog(win!, {
      title: 'Exportar narración',
      defaultPath: join(features.preferences.exportFolder, `${safeName(job.title)}.mp3`),
      filters: [{ name: 'Audio MP3', extensions: ['mp3'] }]
    })
    if (result.canceled || !result.filePath) return null
    await copyFile(join(jobsRoot, job.id, 'narration.mp3'), result.filePath)
    return result.filePath
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1040,
    minHeight: 740,
    show: process.env.FABULA_TEST_MODE !== '1',
    icon: join(here, '../../assets/icon.png'),
    backgroundColor: '#0c0e0e',
    title: 'Fábula — Estudio de narración',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: process.env.FABULA_TEST_MODE !== '1',
      offscreen: process.env.FABULA_TEST_MODE === '1'
    }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-prevent-unload', (event) => {
    const response = dialog.showMessageBoxSync(win!, {
      type: 'question',
      title: 'Dictado en curso',
      message: 'Todavía hay una grabación en curso.',
      detail:
        'Termina el dictado en la pantalla Voz a texto para conservarlo. Si cierras ahora, esta grabación sin terminar se descartará.',
      buttons: ['Seguir grabando', 'Cerrar sin guardar este dictado'],
      defaultId: 0,
      cancelId: 0
    })
    if (response === 1) event.preventDefault()
    else quitting = false
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.session.setPermissionCheckHandler(
    (contents, permission, _origin, details) =>
      contents === win?.webContents &&
      permission === 'media' &&
      'mediaType' in details &&
      details.mediaType === 'audio' &&
      Date.now() < features.microphoneUntil
  )
  win.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(
      contents === win?.webContents &&
        permission === 'media' &&
        Date.now() < features.microphoneUntil &&
        'mediaTypes' in details &&
        details.mediaTypes?.length === 1 &&
        details.mediaTypes[0] === 'audio'
    )
  )
  win.on('closed', () => {
    win = null
  })
  if (process.env.ELECTRON_RENDERER_URL && !app.isPackaged)
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(here, '../renderer/index.html'))
}

app
  .whenReady()
  .then(async () => {
    await load()
    protocol.handle('fabula-audio', async (request) => {
      const url = new URL(request.url),
        id = url.pathname.slice(1)
      if (
        url.hostname !== 'narration' ||
        !idSchema.safeParse(id).success ||
        jobs.get(id)?.status !== 'completed'
      )
        return new Response(null, { status: 404 })
      const path = join(jobsRoot, id, 'narration.mp3')
      try {
        const size = (await stat(path)).size
        const range = parseRange(request.headers.get('range'), size)
        if (range === 'invalid')
          return new Response(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${size}` }
          })
        const start = range?.start ?? 0,
          end = range?.end ?? size - 1
        const headers: Record<string, string> = {
          'Content-Type': 'audio/mpeg',
          'Accept-Ranges': 'bytes',
          'Content-Length': String(end - start + 1)
        }
        if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`
        return new Response(
          Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream,
          { status: range ? 206 : 200, headers }
        )
      } catch {
        return new Response(null, { status: 404 })
      }
    })
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (!win) createWindow()
    })
  })
  .catch((error) => {
    dialog.showErrorBox('No se pudo iniciar Fábula', String(error))
    app.quit()
  })

app.on('window-all-closed', () => app.quit())
app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  Promise.all([
    stop('interrupted'),
    flushDraft(),
    features.close(),
    projects.close(),
    voices.close()
  ]).finally(() => app.quit())
})
