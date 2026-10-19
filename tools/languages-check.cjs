// Real Electron renderer, native menus/dialogs, IPC and workers; isolated user data.
const { app, Menu, dialog } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { randomUUID } = require('node:crypto')
const assert = require('node:assert/strict')
const root = path.resolve('.tools/languages-check', randomUUID())
const data = path.join(root, 'profile')
mkdirSync(data, { recursive: true })
const manuscript =
  'Prefacio de mi novela.\n\nCapítulo 1: Mi mundo\n\nLa historia conserva sus palabras.'
writeFileSync(path.join(data, 'preferences.json'), JSON.stringify({ language: 'es' }))
writeFileSync(
  path.join(data, 'draft.json'),
  JSON.stringify({
    title: 'Mi novela',
    text: manuscript,
    settings: { voice: 'es-MX-JorgeNeural', speed: 1, pitch: 0, volume: 1 }
  })
)
const unsupportedFile = path.join(root, 'example.unknown')
writeFileSync(unsupportedFile, 'not a supported document')
const invalidDocument = path.join(root, 'invalid.docx')
writeFileSync(invalidDocument, 'not a ZIP document')
const dialogs = []
let chosenFile = unsupportedFile
dialog.showOpenDialog = async (_win, options) => {
  dialogs.push(options)
  return { canceled: false, filePaths: [chosenFile] }
}
dialog.showMessageBox = async (_win, options) => {
  dialogs.push(options)
  return { response: 0, checkboxChecked: false }
}
process.env.FABULA_DATA_DIR = data
process.env.FABULA_TEST_MODE = '1'
app.setPath('userData', data)
app.setPath('sessionData', data)
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(fn, label, timeout = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const value = await fn()
    if (value) return value
    await wait(75)
  }
  throw Error(`Timeout: ${label}`)
}
app.once('browser-window-created', (_event, win) => {
  const rendererErrors = []
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') rendererErrors.push(event.message)
  })
  win.webContents.once('did-finish-load', async () => {
    const js = (source) =>
      win.webContents.executeJavaScript(source).catch((error) => {
        console.error('Script:', source)
        console.error('Renderer:', rendererErrors)
        throw error
      })
    const boot = () => js('window.fabula.boot()')
    const click = async (selector) => {
      await js(`document.querySelector(${JSON.stringify(selector)}).click()`)
      await wait(80)
    }
    const nav = async (index) => {
      await js(`document.querySelectorAll('nav button')[${index}].click()`)
      await wait(80)
    }
    const select = async (label, value) => {
      await js(
        `(()=>{const e=document.querySelector('[aria-label="${label}"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}))})()`
      )
      await wait(150)
    }
    try {
      await until(
        () => js('document.querySelector(".autosave")?.textContent==="Borrador guardado"'),
        'Spanish boot'
      )
      assert.equal((await boot()).draft.text, manuscript)
      await nav(4)
      await select('Idioma de la aplicación', 'en')
      await until(() => js('document.documentElement.lang==="en"'), 'English switch')
      assert.equal((await boot()).preferences.language, 'en')
      assert.equal(Menu.getApplicationMenu().items[0].label, 'File')
      assert.match(
        await js('document.querySelector(".page-heading").textContent'),
        /Your studio, your style/
      )
      assert.equal(await js('document.querySelector(".language-settings select").value'), 'en')
      assert.ok(await js(`document.querySelector('[aria-label="Profile name"]')!==null`))
      await nav(2)
      const voices = await js('document.querySelector(".voice-gallery").textContent')
      assert.match(voices, /Mexico/)
      assert.match(voices, /Female/)
      assert.doesNotMatch(voices, /Masculina|Femenina|México|Clara y cálida/)
      await nav(1)
      assert.match(await js('document.querySelector("main").textContent'), /Your projects/)
      await nav(3)
      assert.match(await js('document.querySelector("main").textContent'), /Speech to text/)
      await nav(0)
      assert.equal(await js('document.querySelector("textarea").value'), manuscript)
      await js(
        "[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Chapters, characters and cleanup')).click()"
      )
      await wait(80)
      assert.match(
        await js('document.querySelector(".story-tools-modal").textContent'),
        /Introduction/
      )
      assert.match(
        await js('document.querySelector(".story-tools-modal").textContent'),
        /Capítulo 1: Mi mundo/
      )
      await click('[aria-label="Close tools"]')
      await js(
        "[...document.querySelectorAll('button')].find(e=>e.textContent.includes('About Fábula')).click()"
      )
      await wait(100)
      assert.match(await js('document.querySelector(".modal").textContent'), /Fábula 0\.6\.0/)
      await js(
        "[...document.querySelectorAll('.modal button')].find(e=>e.textContent.includes('Privacy and licenses')).click()"
      )
      await wait(100)
      assert.match(
        await js('document.querySelector(".legal-text").textContent'),
        /WHAT STAYS ON YOUR COMPUTER/
      )
      await js(
        "[...document.querySelectorAll('.legal-tabs button')].find(e=>e.textContent==='Usage notices').click()"
      )
      assert.match(await js('document.querySelector(".legal-text").textContent'), /PROGRAM LICENSE/)
      await click('[aria-label="Close legal documents"]')
      assert.equal(await js('window.fabula.confirm("Keep my draft?")'), false)
      assert.deepEqual(dialogs.at(-1).buttons, ['Cancel', 'Continue'])
      assert.equal(dialogs.at(-1).title, 'Confirm')
      const error = await js('window.fabula.importDocument().catch(e=>e.message)')
      assert.match(error, /Unsupported format/)
      assert.equal(dialogs.at(-1).title, 'Import a story')
      assert.equal(dialogs.at(-1).buttonLabel, 'Open')
      chosenFile = invalidDocument
      const phases = []
      await js('window.__phases=[]; window.fabula.onTask(v=>window.__phases.push(v.phase)); true')
      await js('window.fabula.importDocument().catch(e=>e.message)')
      phases.push(...(await js('window.__phases')))
      assert.ok(phases.includes('Preparing…'))
      assert.ok(phases.includes('Extracting document text'))
      assert.ok(phases.includes('Could not complete'))
      assert.match(
        await js(
          `window.fabula.start({title:'Test',text:'Text',settings:{voice:'invalid',speed:1,pitch:0,volume:1}}).catch(e=>e.message)`
        ),
        /supplied data is invalid/
      )
      await new Promise((resolve) => {
        win.webContents.once('did-finish-load', resolve)
        win.webContents.reload()
      })
      await until(
        () => js('document.querySelector(".autosave")?.textContent==="Draft saved"'),
        'English reload'
      )
      assert.equal((await boot()).draft.title, 'Mi novela')
      assert.equal((await boot()).draft.text, manuscript)
      assert.equal(await js('document.documentElement.lang'), 'en')
      await nav(4)
      await select('Application language', 'es')
      await until(() => js('document.documentElement.lang==="es"'), 'Spanish switch back')
      assert.equal(Menu.getApplicationMenu().items[0].label, 'Archivo')
      assert.equal((await boot()).draft.text, manuscript)
      assert.equal(
        JSON.parse(await fs.readFile(path.join(data, 'preferences.json'), 'utf8')).language,
        'es'
      )
      assert.deepEqual(rendererErrors, [])
      await fs.writeFile(
        path.join(root, 'result.json'),
        JSON.stringify(
          {
            ok: true,
            languages: ['es', 'en'],
            nativeDialogs: true,
            workerProgress: true,
            manuscriptUnchanged: true
          },
          null,
          2
        )
      )
      console.log(
        'PASS: complete ES/EN navigation, voice metadata, legal documents, native menus/dialogs, worker progress, persisted preference and unchanged manuscript'
      )
      app.quit()
    } catch (error) {
      console.error(error)
      await fs
        .writeFile(path.join(root, 'failure.png'), (await win.webContents.capturePage()).toPNG())
        .catch(() => {})
      app.exit(1)
    }
  })
})
import(pathToFileURL(path.resolve('out/main/index.js')).href).catch((error) => {
  console.error(error)
  app.exit(1)
})
