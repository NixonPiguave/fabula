const { app, dialog } = require('electron')
const fs = require('node:fs/promises')
const { mkdirSync, copyFileSync } = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const assert = require('node:assert/strict')
const root = path.resolve(
  process.env.FABULA_CHECK_ASAR ? '.tools/voices-pdf-packaged' : '.tools/voices-pdf-check'
)
mkdirSync(root, { recursive: true })
process.env.FABULA_DATA_DIR = path.join(root, 'Fábula con espacios', 'profile')
process.env.FABULA_TEST_MODE = '1'
mkdirSync(process.env.FABULA_DATA_DIR, { recursive: true })
app.setPath('userData', process.env.FABULA_DATA_DIR)
app.setPath('sessionData', process.env.FABULA_DATA_DIR)
app.disableHardwareAcceleration()
mkdirSync(path.join(process.env.FABULA_DATA_DIR, 'modules/piper'), { recursive: true })
copyFileSync(
  '.tools/voice-fixtures/piper.zip',
  path.join(process.env.FABULA_DATA_DIR, 'modules/piper/piper.zip')
)
let nextFile,
  answer = 0
dialog.showOpenDialog = async () => ({ canceled: !nextFile, filePaths: nextFile ? [nextFile] : [] })
dialog.showMessageBox = async () => ({ response: answer, checkboxChecked: false })
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
function fixturePdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  for (let i = 0; i < 3; i++) {
    const stream = `BT /F1 11 Tf 40 805 Td (CAPITULO 1 - LA CASA DE LOS DIAS PEQUENOS) Tj 0 -200 Td (El joven encontro a su hermano en la casa.) Tj 0 -25 Td (La historia continuaba con una nueva aventura.) Tj 0 -560 Td (${i + 1}) Tj ET`
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
    )
  }
  let data = '%PDF-1.4\n',
    offsets = [0]
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(data))
    data += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(data)
  data += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n')
    .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return data
}
app.once('browser-window-created', (_event, win) => {
  win.webContents.setAudioMuted(true)
  win.webContents.once('did-finish-load', async () => {
    const js = (source) => win.webContents.executeJavaScript(source),
      boot = () => js('window.fabula.boot()')
    const nav = (text) =>
      js(
        `[...document.querySelectorAll('nav button')].find(button=>button.textContent.includes(${JSON.stringify(text)})).click()`
      )
    async function synthesize(voice, text) {
      const job = await js(
        `window.fabula.start({title:${JSON.stringify('Prueba ' + voice.name)},text:${JSON.stringify(text)},settings:{voice:${JSON.stringify(voice.id)},speed:1.15,pitch:10,volume:.8}})`
      )
      await until(async () => {
        const state = (await boot()).jobs.find((item) => item.id === job.id)
        if (state.status === 'failed') throw new Error(state.error)
        return state.status === 'completed'
      }, 'speech ' + voice.name)
      const audio = path.join(process.env.FABULA_DATA_DIR, 'narrations', job.id, 'narration.mp3')
      assert.ok((await fs.stat(audio)).size > 1500)
      return job
    }
    try {
      await until(
        () =>
          js(
            '!!window.fabula && document.querySelector(".autosave")?.textContent === "Borrador guardado"'
          ),
        'boot'
      )
      await js('void(window.confirm=()=>true)')
      nextFile = path.join(root, 'margins.pdf')
      await fs.writeFile(nextFile, fixturePdf())
      await js('document.querySelector(".import-button").click()')
      await until(() => js('!!document.querySelector(".pdf-import-modal")'), 'PDF preview')
      assert.ok(
        !(await js('document.querySelector(".pdf-text-preview pre").textContent')).includes(
          'CAPITULO'
        )
      )
      await js(
        `document.querySelectorAll('.pdf-controls>label input[type=checkbox]')[0].click();document.querySelectorAll('.pdf-controls>label input[type=checkbox]')[1].click();document.querySelectorAll('.pdf-controls>label input[type=checkbox]')[2].click()`
      )
      await until(
        async () =>
          (await js('document.querySelector(".pdf-text-preview pre").textContent')).includes(
            'CAPITULO'
          ),
        'headers included'
      )
      assert.match(await js('document.querySelector(".pdf-text-preview pre").textContent'), /\n1$/)
      await js(
        `document.querySelectorAll('.pdf-controls>label input[type=checkbox]')[0].click();document.querySelectorAll('.pdf-controls>label input[type=checkbox]')[1].click();document.querySelectorAll('.pdf-controls>label input[type=checkbox]')[2].click()`
      )
      await wait(250)
      await fs.writeFile(
        path.join(root, 'pdf-preview.png'),
        (await win.webContents.capturePage()).toPNG()
      )
      await js('document.querySelector(".pdf-import-footer .primary-button").click()')
      await until(
        () => js('document.querySelector(".document-body textarea").value.includes("hermano")'),
        'PDF applied'
      )
      assert.equal((await boot()).draft.text.includes('CAPITULO'), false)
      console.log(
        'PASS: real three-page PDF preview, independently include/exclude headers, footers and page numbers, original retained until Apply'
      )
      await nav('Explorar voces')
      assert.ok((await boot()).voices.every((voice) => ['sapi', 'piper'].includes(voice.provider)))
      await js(`window.fabula.installModule('piper')`)
      nextFile = path.resolve('.tools/voice-fixtures/es_ES-davefx-medium.onnx')
      const previous = (await boot()).voices
      const state = previous.some((voice) => voice.name === 'Narrador local de prueba')
        ? previous
        : await js(`window.fabula.importVoice({name:'Narrador local de prueba',speaker:0})`)
      const local = state.find((voice) => voice.name === 'Narrador local de prueba')
      assert.ok(local)
      const localJob = await synthesize(
        local,
        'Aquella noche, el joven encontro un camino diferente. Su hermano lo esperaba junto a la puerta.'
      )
      console.log(
        'PASS: verified Piper engine installation, ONNX/config import and actual offline MP3 synthesis in a Unicode/space-containing data path'
      )
      const sapi = (await boot()).voices.find((voice) => voice.provider === 'sapi')
      assert.ok(sapi, 'At least one installed Windows SAPI voice required by this Windows fixture')
      await synthesize(
        sapi,
        'A quiet evening. The young traveler returned home and found his family waiting.'
      )
      console.log('PASS: actual Windows SAPI voice synthesis through the bundled 32/64-bit bridge')
      await js('document.querySelector(".toast .icon-button")?.click(); void 0')
      await wait(250)
      await fs.writeFile(
        path.join(root, 'external-voices.png'),
        (await win.webContents.capturePage()).toPNG()
      )
      assert.equal(await js(`window.fabula.removeVoice(${JSON.stringify(local.id)})`), false)
      answer = 1
      assert.equal(await js(`window.fabula.removeVoice(${JSON.stringify(local.id)})`), true)
      assert.ok((await boot()).jobs.some((job) => job.id === localJob.id))
      assert.ok(
        (
          await fs.stat(
            path.join(process.env.FABULA_DATA_DIR, 'narrations', localJob.id, 'narration.mp3')
          )
        ).size > 1500
      )
      await nav('Tu biblioteca')
      await until(
        () => js('!!document.querySelector(".library-item")'),
        'external voice library survives removal'
      )
      assert.ok((await js('document.body.textContent')).includes('Voz externa no disponible'))
      console.log(
        'PASS: withdrawing a model keeps generated audio and library usable with a missing-voice fallback'
      )
      await fs.writeFile(
        path.join(root, 'result.json'),
        JSON.stringify(
          { ok: true, pdfPages: 3, localVoice: local.id, sapiVoice: sapi.name, localOnly: true },
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
const main = process.env.FABULA_CHECK_ASAR
  ? path.join(process.env.FABULA_CHECK_ASAR, 'out/main/index.js')
  : path.resolve('out/main/index.js')
import(pathToFileURL(main).href).catch((error) => {
  console.error(error)
  app.exit(1)
})
