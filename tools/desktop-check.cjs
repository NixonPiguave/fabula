// Integration check of our own Electron app in an isolated workspace profile.
const { app, BrowserWindow, dialog, net } = require('electron')
const fs = require('node:fs/promises')
const { mkdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')

const root = path.resolve(
  process.env.FABULA_CHECK_ASAR ? '.tools/packaged-check' : '.tools/desktop-check'
)
mkdirSync(root, { recursive: true })
process.env.FABULA_DATA_DIR = path.join(root, 'profile')
process.env.FABULA_TEST_MODE = '1'
mkdirSync(process.env.FABULA_DATA_DIR, { recursive: true })
writeFileSync(
  path.join(process.env.FABULA_DATA_DIR, 'preferences.json'),
  JSON.stringify({ language: 'es' })
)
app.setPath('userData', process.env.FABULA_DATA_DIR)
app.setPath('sessionData', process.env.FABULA_DATA_DIR)
app.disableHardwareAcceleration()
dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })

dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(root, 'exported.mp3') })
dialog.showOpenDialog = async () => ({
  canceled: false,
  filePaths: [path.resolve('.tools/smoke/fixture.pdf')]
})
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(fn, label, timeout = 90000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const value = await fn()
    if (value) return value
    await wait(100)
  }
  throw new Error(`Timeout: ${label}`)
}

app.once('browser-window-created', (_event, win) => {
  win.webContents.setAudioMuted(true)
  win.webContents.once('did-finish-load', async () => {
    const js = (source) => win.webContents.executeJavaScript(source)
    try {
      await until(
        () =>
          js(
            `!!window.fabula && document.querySelector('.autosave')?.textContent === 'Borrador guardado'`
          ),
        'renderer boot'
      )
      assert.equal(await js(`typeof window.require`), 'undefined')
      assert.equal(await js(`typeof window.process`), 'undefined')
      console.log('PASS: sandboxed desktop renderer and preload bridge')
      const title = 'El comienzo de una nueva historia'
      const text =
        'Capítulo 1. Un mundo por descubrir.\n\nAquella noche, el joven abrió los ojos y descubrió un mundo diferente. Desde la ventana podía ver las montañas, cubiertas por una niebla dorada. Su hermano lo esperaba junto a la puerta.\n\n—Es hora de partir —dijo, con una sonrisa.\n\nNo sabía qué les deparaba el destino, pero estaba decidido a proteger a su familia. Y así comenzó una aventura que ninguno de los dos olvidaría.'
      await js(`(() => {
        const title = document.querySelector('.title-input');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(title, ${JSON.stringify(title)});
        title.dispatchEvent(new Event('input', { bubbles: true }));
        const text = document.querySelector('textarea');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(text, ${JSON.stringify(text)});
        text.dispatchEvent(new Event('input', { bubbles: true }));
      })()`)
      await until(
        () => js(`!document.querySelector('.generate-row .primary-button').disabled`),
        'editor ready'
      )
      await wait(500)
      const draft = await js(`window.fabula.boot().then(state => state.draft)`)
      assert.equal(draft.text, text)
      assert.equal(draft.title, title)
      console.log('PASS: editor inputs and draft persistence')
      await js(`document.querySelector('.generate-row .primary-button').click()`)
      const job = await until(
        () =>
          js(
            `window.fabula.boot().then(state => state.jobs.find(job => job.title === ${JSON.stringify(title)} && ['generating', 'merging'].includes(job.status)))`
          ),
        'job creation'
      )
      const duplicate = await js(
        `window.fabula.start({ title: 'Duplicate', text: 'Prueba', settings: ${JSON.stringify(draft.settings)} }).then(() => 'accepted', () => 'rejected')`
      )
      assert.equal(duplicate, 'rejected')
      const finished = await until(async () => {
        const result = await js(
          `window.fabula.boot().then(state => state.jobs.find(job => job.id === ${JSON.stringify(job.id)}))`
        )
        if (result.status === 'failed') throw new Error(result.error)
        return result.status === 'completed' ? result : null
      }, 'real desktop narration')
      assert.equal(finished.status, 'completed')
      await until(
        () =>
          js(
            `Number.isFinite(document.querySelector('audio').duration) && document.querySelector('audio').duration > 0`
          ),
        'audio metadata'
      )
      const audioDuration = await js(`document.querySelector('audio').duration`)
      assert.ok(audioDuration > 2)
      await js(`document.querySelector('audio').play()`)
      await wait(400)
      assert.ok(await js(`document.querySelector('audio').currentTime > 0`))
      await js(
        `document.querySelector('audio').pause(); document.querySelector('audio').currentTime = 2`
      )
      assert.equal(await js(`document.querySelector('audio').currentTime`), 2)
      console.log('PASS: actual narration, concurrent-job protection, embedded playback and seek')
      const range = await net.fetch(`fabula-audio://narration/${job.id}`, {
        headers: { Range: 'bytes=100-199' }
      })
      assert.equal(range.status, 206)
      assert.equal((await range.arrayBuffer()).byteLength, 100)
      const invalid = await net.fetch('fabula-audio://narration/invalid')
      assert.equal(invalid.status, 404)
      const output = await js(`window.fabula.exportMp3(${JSON.stringify(job.id)})`)
      const source = await fs.readFile(
        path.join(root, 'profile/narrations', job.id, 'narration.mp3')
      )
      assert.deepEqual(await fs.readFile(output), source)
      console.log('PASS: secure ranged audio route and real MP3 export')
      await js(`document.querySelector('.toast .icon-button')?.click(); void 0`)
      await js(
        `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`
      )
      await wait(400)
      await fs.writeFile(
        path.join(root, 'studio.png'),
        (await win.webContents.capturePage()).toPNG()
      )
      await js(`document.querySelector('.import-button').click()`)
      await until(() => js(`!!document.querySelector('.pdf-import-modal')`), 'PDF margin preview')
      await js(`document.querySelector('.pdf-import-footer .primary-button').click()`)
      await until(
        () =>
          js(`document.querySelector('textarea').value.includes('dragon encontro a su hermano')`),
        'PDF imported into editor'
      )
      console.log('PASS: native PDF import through actual IPC and extraction worker')
      await js(
        `[...document.querySelectorAll('nav button')].find(button => button.textContent.includes('Tu biblioteca')).click()`
      )
      await until(() => js(`!!document.querySelector('.library-item')`), 'library render')
      await js(
        `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`
      )
      await wait(400)
      await fs.writeFile(
        path.join(root, 'library.png'),
        (await win.webContents.capturePage()).toPNG()
      )
      await js(
        `[...document.querySelectorAll('nav button')].find(button => button.textContent.includes('Explorar voces')).click()`
      )
      await until(() => js(`document.querySelectorAll('.voice-card').length > 0`), 'voice catalog')
      await wait(400)
      await fs.writeFile(
        path.join(root, 'voices.png'),
        (await win.webContents.capturePage()).toPNG()
      )
      await fs.writeFile(
        path.join(root, 'result.json'),
        JSON.stringify({ ok: true, job: job.id, audioDuration, export: output }, null, 2)
      )
      console.log(`PASS: desktop integration complete; screenshots in ${root}`)
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

const mainEntry = process.env.FABULA_CHECK_ASAR
  ? path.join(process.env.FABULA_CHECK_ASAR, 'out/main/index.js')
  : path.resolve('out/main/index.js')
import(pathToFileURL(mainEntry).href).catch((error) => {
  console.error(error)
  app.exit(1)
})
