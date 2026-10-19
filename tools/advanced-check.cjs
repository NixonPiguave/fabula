const { app, dialog } = require('electron')
const fs = require('node:fs/promises')
const {
  mkdirSync,
  readdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync
} = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const { createCanvas } = require('@napi-rs/canvas')
const root = path.resolve(
  process.env.FABULA_CHECK_ASAR ? '.tools/advanced-packaged' : '.tools/advanced-check'
)
mkdirSync(root, { recursive: true })
process.env.FABULA_DATA_DIR = path.join(root, 'profile')
process.env.FABULA_TEST_MODE = '1'
mkdirSync(process.env.FABULA_DATA_DIR, { recursive: true })
app.setPath('userData', process.env.FABULA_DATA_DIR)
app.setPath('sessionData', process.env.FABULA_DATA_DIR)
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('use-fake-device-for-media-stream')
app.commandLine.appendSwitch(
  'use-file-for-fake-audio-capture',
  path.join(root, 'fake-microphone.wav')
)
// Seed a persisted chunk-format job before Electron's ready event to test resumability.
const legacyId = '11111111-1111-4111-8111-111111111111'
const legacySource = readdirSync('.tools/smoke', { withFileTypes: true }).find(
  (entry) =>
    entry.isDirectory() && existsSync(path.join('.tools/smoke', entry.name, 'narration.mp3'))
)
if (legacySource) {
  const source = path.join('.tools/smoke', legacySource.name),
    target = path.join(root, 'profile/narrations', legacyId)
  mkdirSync(target, { recursive: true })
  for (const file of readdirSync(source))
    copyFileSync(path.join(source, file), path.join(target, file))
  const job = JSON.parse(readFileSync(path.join(target, 'job.json'), 'utf8'))
  writeFileSync(
    path.join(target, 'job.json'),
    JSON.stringify({ ...job, id: legacyId, status: 'cancelled', title: 'Narración interrumpida' })
  )
}
let nextFile,
  exported = 0
dialog.showOpenDialog = async (_window, options) => ({
  canceled: false,
  filePaths: [options.properties.includes('openDirectory') ? root : nextFile]
})
dialog.showSaveDialog = async (_window, options) => ({
  canceled: false,
  filePath: path.join(root, `export-${++exported}.${options.filters[0].extensions[0]}`)
})
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(fn, label, timeout = 180000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const value = await fn()
    if (value) return value
    await wait(100)
  }
  throw new Error(`Timeout: ${label}`)
}
function rasterPdf(jpeg, width, height) {
  const content = 'q 500 0 0 150 40 600 cm /Im0 Do Q'
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'
    ),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
      ),
      jpeg,
      Buffer.from('\nendstream')
    ]),
    Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  ]
  const pieces = [Buffer.from('%PDF-1.4\n')],
    offsets = [0]
  let length = pieces[0].length
  objects.forEach((object, i) => {
    offsets.push(length)
    const bytes = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`),
      object,
      Buffer.from('\nendobj\n')
    ])
    pieces.push(bytes)
    length += bytes.length
  })
  pieces.push(
    Buffer.from(
      `xref\n0 6\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
        .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`
    )
  )
  return Buffer.concat(pieces)
}
async function prepare() {
  const { spawnSync } = require('node:child_process')
  const converted = spawnSync(
    path.resolve('.tools/media-runtime/ffmpeg.exe'),
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      path.resolve('.tools/fixtures/sample.mp3'),
      '-ar',
      '48000',
      '-ac',
      '1',
      path.join(root, 'fake-microphone.wav')
    ],
    { windowsHide: true }
  )
  assert.equal(converted.status, 0)
  for (const kind of ['ocr', 'transcription'])
    await fs.mkdir(path.join(root, 'profile/modules', kind), { recursive: true })
  await fs.copyFile(
    '.tools/module-downloads/spa.traineddata',
    path.join(root, 'profile/modules/ocr/spa.traineddata')
  )
  await fs.copyFile(
    '.tools/module-downloads/whisper.zip',
    path.join(root, 'profile/modules/transcription/runtime.zip')
  )
  await fs.copyFile(
    '.tools/module-downloads/ggml-base.bin',
    path.join(root, 'profile/modules/transcription/ggml-base.bin')
  )
  const canvas = createCanvas(1000, 280),
    context = canvas.getContext('2d')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, 1000, 280)
  context.fillStyle = '#000'
  context.font = '42px Arial'
  context.fillText('Capítulo 1. El joven abrió la puerta.', 45, 90)
  context.fillText('Su hermano esperaba junto al camino.', 45, 165)
  await fs.writeFile(path.join(root, 'ocr.png'), await canvas.encode('png'))
  await fs.writeFile(path.join(root, 'scan.pdf'), rasterPdf(await canvas.encode('jpeg'), 1000, 280))
}
app.once('browser-window-created', (_event, win) => {
  win.webContents.setAudioMuted(true)
  win.webContents.once('did-finish-load', async () => {
    const js = (source) => win.webContents.executeJavaScript(source)
    const boot = () => js('window.fabula.boot()')
    const clickNav = async (name) => {
      await js(
        `[...document.querySelectorAll('nav button')].find(button => button.textContent.includes(${JSON.stringify(name)})).click()`
      )
      await wait(100)
    }
    const field = async (label, value, select = false) =>
      js(
        `(() => { const element = [...document.querySelectorAll('[aria-label]')].find(item => item.getAttribute('aria-label') === ${JSON.stringify(label)}); Object.getOwnPropertyDescriptor(${select ? 'HTMLSelectElement' : 'HTMLInputElement'}.prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('${select ? 'change' : 'input'}', { bubbles: true })); })()`
      )
    try {
      await prepare()
      const localVoice = (await boot()).voices.find((voice) => voice.provider === 'sapi')
      assert.ok(localVoice)
      await until(
        () =>
          js(
            '!!window.fabula && document.querySelector(".autosave")?.textContent === "Borrador guardado"'
          ),
        'boot'
      )
      if (legacySource) {
        assert.equal((await boot()).jobs.find((item) => item.id === legacyId).status, 'cancelled')
        await js(`window.fabula.resume(${JSON.stringify(legacyId)})`)
        await until(
          async () =>
            (await boot()).jobs.find((item) => item.id === legacyId).status === 'completed',
          'legacy resume'
        )
        console.log('PASS: persisted chunk-format job loads and resumes without data loss')
      }
      await clickNav('Preferencias')
      await js(
        `(() => { const element = document.querySelector('select[aria-label="Tema"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(element, 'light'); element.dispatchEvent(new Event('change', { bubbles: true })); })()`
      )
      await until(async () => (await boot()).preferences.theme === 'light', 'theme persistence')
      await field('Nombre del perfil', 'Lectura de prueba')
      await js(`document.querySelector('.profile-editor button[type=submit]').click()`)
      await until(
        async () =>
          (await boot()).preferences.profiles.some((item) => item.name === 'Lectura de prueba'),
        'profile'
      )
      await field('Nombre escrito', 'Dr.')
      await field('Pronunciación', 'doctor')
      await js(`document.querySelector('.pronunciation-form button').click()`)
      await until(
        async () =>
          (await boot()).preferences.pronunciations.some((item) => item.written === 'Dr.'),
        'dictionary'
      )
      console.log('PASS: preferences, named voice profile and pronunciation dictionary through UI')
      await js(`window.fabula.installModule('ocr')`)
      await js(`window.fabula.installModule('transcription')`)
      assert.ok(
        (await boot()).modules
          .filter((module) => module.kind !== 'piper')
          .every((module) => module.installed)
      )
      console.log(
        'PASS: module installation verifies official cached downloads and extracts runtime'
      )
      await wait(400)
      await fs.writeFile(
        path.join(root, 'preferences.png'),
        (await win.webContents.capturePage()).toPNG()
      )
      for (const file of ['story.docx', 'story.epub', 'story.odt', 'story.rtf']) {
        nextFile = path.resolve('.tools/format-fixtures', file)
        const result = await js('window.fabula.importDocument()')
        assert.ok(result.text.length > 10, file)
      }
      nextFile = path.join(root, 'ocr.png')
      const image = await js('window.fabula.importDocument({ocr:true})')
      assert.match(image.text, /hermano/i)
      console.log('PASS: real Spanish image OCR')
      nextFile = path.join(root, 'scan.pdf')
      const pdf = await js('window.fabula.importDocument({ocr:true})')
      assert.match(pdf.text, /hermano/i)
      assert.equal(pdf.pages, 1)
      console.log('PASS: rasterized scanned-PDF OCR')
      await clickNav('Estudio')
      const text =
        'Capítulo 1\n\nDr. abrió la puerta.\n\nCapítulo 2\n\nSu hermano esperaba junto al camino.'
      await js(
        `(() => { const title = document.querySelector('.title-input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(title,'Historia con capítulos'); title.dispatchEvent(new Event('input',{bubbles:true})); const textarea = document.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(textarea,${JSON.stringify(text)}); textarea.dispatchEvent(new Event('input',{bubbles:true})); })()`
      )
      await wait(500)
      await js(`document.querySelector('.studio-tool-row button').click()`)
      await js(
        `[...document.querySelectorAll('.feature-tabs button')].find(button=>button.textContent.includes('Párrafos')).click()`
      )
      await js(`document.querySelectorAll('.paragraph-list>button')[1].click()`)
      await field('Voz del personaje o fragmento', localVoice.id, true)
      await js(`document.querySelector('[aria-label="Cerrar herramientas"]').click()`)
      await until(
        async () =>
          Object.values((await boot()).draft.blockOverrides ?? {}).some(
            (value) => value.voice === localVoice.id
          ),
        'paragraph voice persistence'
      )
      const draft = (await boot()).draft
      assert.ok(Object.values(draft.blockOverrides).some((value) => value.voice === localVoice.id))
      const job = await js(`window.fabula.start(${JSON.stringify(draft)})`)
      const finished = await until(async () => {
        const item = (await boot()).jobs.find((item) => item.id === job.id)
        if (item.status === 'failed') throw new Error(item.error)
        return item.status === 'completed' ? item : null
      }, 'chapter synthesis')
      assert.equal(finished.chapters.length, 2)
      assert.ok(finished.chapters[1].startSeconds > 0)
      const folder = await js(`window.fabula.exportChapters(${JSON.stringify(job.id)})`)
      assert.equal((await fs.readdir(folder)).filter((name) => name.endsWith('.mp3')).length, 2)
      const repeated = await js(`window.fabula.start(${JSON.stringify(draft)})`)
      const cached = await until(async () => {
        const item = (await boot()).jobs.find((item) => item.id === repeated.id)
        if (item.status === 'failed') throw new Error(item.error)
        return item.status === 'completed' ? item : null
      }, 'cached narration')
      assert.equal(cached.cachedChunks, cached.totalChunks)
      console.log(
        'PASS: characters, dictionary, two chapters, separate MP3s and full audio-cache reuse'
      )
      await clickNav('Voz a texto')
      nextFile = path.resolve('.tools/fixtures/sample.mp3')
      const beforeFileTranscription = (await boot()).transcripts.length
      await js(
        `[...document.querySelectorAll('.transcription-controls button')].find(button=>button.textContent.includes('Importar')).click()`
      )
      await until(
        async () => {
          const state = await boot()
          return state.transcripts.length > beforeFileTranscription
        },
        'local speech transcription',
        240000
      )
      await until(
        () => js('!!document.querySelector(".transcript-segments textarea")'),
        'transcript in UI'
      )
      const transcript = (await boot()).transcripts[0]
      assert.ok(transcript.segments.length > 0)
      assert.match(transcript.text, /hermano|familia|mundo/i)
      for (const format of ['txt', 'docx', 'srt', 'vtt']) {
        const output = await js(
          `window.fabula.exportTranscript(${JSON.stringify(transcript)}, ${JSON.stringify(format)})`
        )
        assert.ok((await fs.stat(output)).size > 10)
        if (format === 'srt')
          assert.match(await fs.readFile(output, 'utf8'), /00:00:\d\d,\d{3} -->/)
        if (format === 'vtt') assert.ok((await fs.readFile(output, 'utf8')).startsWith('WEBVTT'))
      }
      await wait(400)
      await fs.writeFile(
        path.join(root, 'transcription.png'),
        (await win.webContents.capturePage()).toPNG()
      )
      console.log('PASS: actual local Whisper transcription and TXT/DOCX/SRT/WebVTT exports')
      const count = (await boot()).transcripts.length
      await until(
        () =>
          js(
            `[...document.querySelectorAll('.transcription-controls button')].some(button=>button.textContent.includes('Grabar')&&!button.disabled)`
          ),
        'dictation ready'
      )
      await js(
        `[...document.querySelectorAll('.transcription-controls button')].find(button=>button.textContent.includes('Grabar')).click()`
      )
      await until(
        () => js('!!document.querySelector(".recording-stop")'),
        'fake microphone recording'
      )
      await wait(4200)
      await js(`document.querySelector('.recording-stop').click()`)
      await until(
        async () => (await boot()).transcripts.length > count,
        'recorded dictation transcription',
        240000
      )
      await until(
        async () => (await boot()).transcripts[0]?.title === 'Mi dictado',
        'saved dictation UI result'
      )
      console.log(
        'PASS: dictation UI, MediaRecorder and recording transcription with a fictional file as fake microphone; no physical microphone used'
      )
      const beforeNavigation = (await boot()).transcripts.length
      await until(
        () =>
          js(
            `[...document.querySelectorAll('.transcription-controls button')].some(button=>button.textContent.includes('Grabar')&&!button.disabled)`
          ),
        'second dictation ready'
      )
      await js(
        `[...document.querySelectorAll('.transcription-controls button')].find(button=>button.textContent.includes('Grabar')).click()`
      )
      await until(() => js('!!document.querySelector(".recording-stop")'), 'second fake recording')
      await wait(4200)
      let closePrompts = 0
      const originalMessageBox = dialog.showMessageBoxSync
      dialog.showMessageBoxSync = () => {
        closePrompts++
        return 0
      }
      app.quit()
      await until(() => closePrompts === 1, 'recording close confirmation')
      assert.equal(win.isDestroyed(), false)
      assert.ok(await js('!!document.querySelector(".recording-stop")'))
      dialog.showMessageBoxSync = originalMessageBox
      console.log('PASS: cancelling application quit keeps the active dictation and window open')
      await clickNav('Preferencias')
      await until(
        async () => (await boot()).transcripts.length > beforeNavigation,
        'dictation preserved on navigation',
        240000
      )
      await until(
        async () => (await boot()).transcripts[0]?.title === 'Mi dictado',
        'background dictation saved'
      )
      console.log(
        'PASS: navigating away stops capture and preserves the dictation by transcribing in the background'
      )
      const playback = {
        currentId: job.id,
        positions: { [job.id]: 2 },
        bookmarks: {
          [job.id]: [{ id: require('node:crypto').randomUUID(), label: 'Mi escena', seconds: 2 }]
        }
      }
      await js(`window.fabula.savePlayback(${JSON.stringify(playback)})`)
      await new Promise((resolve) => {
        win.webContents.once('did-finish-load', resolve)
        win.webContents.reload()
      })
      await until(
        () =>
          js(
            '!!window.fabula && document.querySelector(".autosave")?.textContent === "Borrador guardado"'
          ),
        'reloaded UI'
      )
      const restored = await boot()
      assert.equal(restored.preferences.theme, 'light')
      assert.equal(restored.playback.bookmarks[job.id][0].label, 'Mi escena')
      assert.ok(restored.transcripts.length > 0)
      await until(
        () => js('document.querySelector("audio").currentTime >= 1.9'),
        'restored reading position'
      )
      console.log(
        'PASS: preferences, transcript, bookmarks and playback position survive renderer restart'
      )
      await fs.writeFile(
        path.join(root, 'result.json'),
        JSON.stringify(
          {
            ok: true,
            ocr: image.text,
            scannedPdf: pdf.text,
            transcript: transcript.text,
            chapters: finished.chapters.length,
            cached: cached.cachedChunks
          },
          null,
          2
        )
      )
      app.quit()
    } catch (error) {
      console.error(error)
      try {
        await fs.writeFile(
          path.join(root, 'failure.png'),
          (await win.webContents.capturePage()).toPNG()
        )
      } catch {}
      app.exit(1)
    }
  })
})
import(
  pathToFileURL(
    process.env.FABULA_CHECK_ASAR
      ? path.join(process.env.FABULA_CHECK_ASAR, 'out/main/index.js')
      : path.resolve('out/main/index.js')
  ).href
).catch((error) => {
  console.error(error)
  app.exit(1)
})
