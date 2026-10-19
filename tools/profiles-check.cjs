// Real renderer and IPC integration with an isolated library. No personal data.
const { app, dialog } = require('electron')
let confirmResponse = 1
dialog.showMessageBox = async () => ({ response: confirmResponse, checkboxChecked: false })
const fs = require('node:fs/promises')
const { mkdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const root = path.resolve(
  process.env.FABULA_CHECK_ASAR ? '.tools/profiles-packaged' : '.tools/profiles-check'
)
const data = path.join(root, `profile-${randomUUID()}`)
mkdirSync(data, { recursive: true })
const legacy = {
  id: randomUUID(),
  name: 'Lectura diaria',
  settings: { voice: 'es-MX-JorgeNeural', speed: 1.1, pitch: -3, volume: 0.8 },
  pauseMs: 350
}
const missing = {
  ...legacy,
  id: randomUUID(),
  name: 'Voz retirada',
  settings: { ...legacy.settings, voice: `piper:${'a'.repeat(64)}` }
}
writeFileSync(path.join(data, 'preferences.json'), JSON.stringify({ profiles: [legacy, missing] }))
process.env.FABULA_DATA_DIR = data
process.env.FABULA_TEST_MODE = '1'
app.setPath('userData', data)
app.setPath('sessionData', data)
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(fn, label, timeout = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const result = await fn()
    if (result) return result
    await wait(80)
  }
  throw Error(`Timeout: ${label}`)
}
app.once('browser-window-created', (_event, win) => {
  win.webContents.setAudioMuted(true)
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') console.error('RENDERER:', event.message)
  })
  win.webContents.once('did-finish-load', async () => {
    const js = (text) =>
      win.webContents.executeJavaScript(text).catch((error) => {
        console.error('Script:', text)
        throw error
      })
    const boot = () => js('window.fabula.boot()')
    const click = async (selector) => {
      await js(`document.querySelector(${JSON.stringify(selector)}).click()`)
      await wait(60)
    }
    const nav = async (name) => {
      await js(
        `[...document.querySelectorAll('nav button')].find(button=>button.textContent.includes(${JSON.stringify(name)})).click()`
      )
      await wait(60)
    }
    const field = async (label, value, select = false) => {
      await js(
        `(() => { const element=document.querySelector('[aria-label="${label}"]');Object.getOwnPropertyDescriptor(${select ? 'HTMLSelectElement' : 'HTMLInputElement'}.prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('${select ? 'change' : 'input'}',{bubbles:true})); })()`
      )
      await wait(60)
    }
    const submit = () => click('.profile-editor button[type=submit]')
    try {
      await until(
        () => js('document.querySelector(".autosave")?.textContent === "Borrador guardado"'),
        'initial load'
      )
      assert.deepEqual((await boot()).preferences.profiles, [legacy, missing])
      await nav('Preferencias')
      assert.equal(await js(`document.querySelectorAll('.saved-profile').length`), 2)
      assert.equal(
        await js(
          `document.querySelectorAll('.saved-profile')[1].querySelector('.secondary-button').disabled`
        ),
        true
      )
      console.log(
        'PASS: existing profiles remain compatible and missing voices have a clear disabled state'
      )
      await submit()
      assert.match(
        await js(`document.querySelector('.profile-editor [role=alert]').textContent`),
        /nombre/
      )
      await field('Nombre del perfil', 'Lectura diaria')
      await submit()
      assert.match(
        await js(`document.querySelector('.profile-editor [role=alert]').textContent`),
        /Ya hay/
      )
      await field('Nombre del perfil', 'Lectura tranquila')
      await field('Voz del perfil', 'es-MX-DaliaNeural', true)
      await field('Velocidad del perfil', '.85')
      await field('Tono del perfil', '-5')
      await field('Volumen del perfil', '.7')
      await field('Pausa del perfil', '1000')
      await submit()
      const created = await until(
        async () =>
          (await boot()).preferences.profiles.find(
            (profile) => profile.name === 'Lectura tranquila'
          ),
        'create profile'
      )
      assert.deepEqual(created.settings, {
        voice: 'es-MX-DaliaNeural',
        speed: 0.85,
        pitch: -5,
        volume: 0.7
      })
      assert.equal(created.pauseMs, 1000)
      await click('[aria-label="Editar perfil Lectura tranquila"]')
      await field('Nombre del perfil', 'Lectura pausada')
      await field('Velocidad del perfil', '.9')
      await submit()
      const edited = await until(
        async () =>
          (await boot()).preferences.profiles.find((profile) => profile.name === 'Lectura pausada'),
        'edit profile'
      )
      assert.equal(edited.id, created.id)
      assert.equal(edited.settings.speed, 0.9)
      assert.equal((await boot()).preferences.profiles.length, 3)
      await click('[aria-label="Editar perfil Lectura pausada"]')
      await field('Nombre del perfil', 'Cambio descartado')
      await js(
        `Array.from(document.querySelectorAll('.profile-editor button')).find(button=>button.textContent==='Cancelar edición').click()`
      )
      assert.equal(
        (await boot()).preferences.profiles.find((item) => item.id === edited.id).name,
        'Lectura pausada'
      )
      console.log(
        'PASS: create, duplicate validation, edit in place and cancel preserve exact settings'
      )
      await js(
        `Array.from(document.querySelectorAll('.saved-profile')).find(card=>card.querySelector('h4').textContent==='Lectura pausada').querySelector('.secondary-button').click()`
      )
      await until(async () => (await boot()).draft.settings.speed === 0.9, 'apply profile')
      const draft = (await boot()).draft
      assert.deepEqual(draft.settings, edited.settings)
      assert.equal(draft.pauseMs, 1000)
      assert.equal(await js('document.querySelector(".profile-select").value'), edited.id)
      assert.equal(
        await js(`document.querySelector('[aria-label="Pausa general entre párrafos"]').value`),
        '1000'
      )
      await nav('Preferencias')
      await field('Nombre del perfil', 'Copia del estudio')
      await js(`document.querySelector('.profile-copy').click()`)
      await submit()
      assert.deepEqual(
        (await boot()).preferences.profiles.find((item) => item.name === 'Copia del estudio')
          .settings,
        edited.settings
      )
      await click('[aria-label="Editar perfil Lectura diaria"]')
      const local = (await boot()).voices.find((voice) => voice.provider === 'sapi')
      assert.ok(local, 'A Windows voice is required to test profile previews offline')
      await field('Voz del perfil', local.id, true)
      await js(
        `Array.from(document.querySelectorAll('.profile-editor button')).find(button=>button.textContent.includes('Escuchar muestra')).click()`
      )
      const preview = await until(
        async () => (await boot()).jobs.find((job) => job.preview),
        'preview request'
      )
      assert.deepEqual(preview.settings, { ...legacy.settings, voice: local.id })
      await until(
        async () => (await boot()).jobs.find((job) => job.id === preview.id).status === 'completed',
        'local preview synthesis',
        60000
      )
      const manifest = JSON.parse(
        await fs.readFile(path.join(data, 'narrations', preview.id, 'job.json'), 'utf8')
      )
      assert.equal(manifest.pauseMs, legacy.pauseMs)
      assert.ok(
        (await fs.stat(path.join(data, 'narrations', preview.id, 'narration.mp3'))).size > 1000
      )
      console.log(
        'PASS: applying and copying profiles works; preview uses the edited profile rather than hidden studio settings'
      )
      confirmResponse = 0
      await click('[aria-label="Eliminar perfil Lectura pausada"]')
      assert.equal((await boot()).preferences.profiles.length, 4)
      confirmResponse = 1
      await click('[aria-label="Eliminar perfil Lectura pausada"]')
      await until(
        async () => !(await boot()).preferences.profiles.some((item) => item.id === edited.id),
        'remove profile'
      )
      await new Promise((resolve) => {
        win.webContents.once('did-finish-load', resolve)
        win.webContents.reload()
      })
      await until(
        () => js('document.querySelector(".autosave")?.textContent === "Borrador guardado"'),
        'reload'
      )
      const disk = JSON.parse(await fs.readFile(path.join(data, 'preferences.json'), 'utf8'))
      assert.equal(disk.profiles.length, 3)
      assert.deepEqual((await boot()).draft.settings, edited.settings)
      await nav('Preferencias')
      await click('[aria-label="Editar perfil Lectura diaria"]')
      await field('Nombre del perfil', 'Lectura tranquila')
      await js(
        'document.querySelector(".voice-profiles").scrollIntoView({block:"start"}); document.querySelector(".toast .icon-button")?.click(); void 0'
      )
      await wait(150)
      await fs.writeFile(
        path.join(root, 'profiles.png'),
        (await win.webContents.capturePage()).toPNG()
      )
      await win.setSize(1040, 820)
      await wait(100)
      assert.equal(
        await js(
          `(()=>{const card=document.querySelector('.voice-profiles');return card.scrollWidth>card.clientWidth+2})()`
        ),
        false
      )
      win.setSize(1440, 960)
      await wait(100)
      await js(
        `(()=>{const element=document.querySelector('[aria-label=\"Tema\"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(element,'light');element.dispatchEvent(new Event('change',{bubbles:true}))})()`
      )
      await until(async () => (await boot()).preferences.theme === 'light', 'light theme')
      await wait(100)
      await fs.writeFile(
        path.join(root, 'profiles-light.png'),
        (await win.webContents.capturePage()).toPNG()
      )
      await js(
        `(()=>{const element=document.querySelector('[aria-label=\"Tema\"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(element,'dark');element.dispatchEvent(new Event('change',{bubbles:true}))})()`
      )
      await until(async () => (await boot()).preferences.theme === 'dark', 'dark theme')
      const overflow = await js(
        `(()=>{const card=document.querySelector('.voice-profiles');return card.scrollWidth>card.clientWidth+2})()`
      )
      assert.equal(overflow, false)
      await js(
        `[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Acerca de Fábula')).click()`
      )
      await js(
        `Array.from(document.querySelectorAll('.modal button')).find(button=>button.textContent==='Privacidad y licencias').click()`
      )
      assert.match(await js('document.querySelector(".legal-text").textContent'), /PRIVACIDAD/)
      await js(
        `[...document.querySelectorAll('.legal-tabs button')].find(button=>button.textContent==='Licencia GPL').click()`
      )
      assert.match(
        await js('document.querySelector(".legal-text").textContent'),
        /GNU GENERAL PUBLIC LICENSE/
      )
      await wait(100)
      await fs.writeFile(
        path.join(root, 'legal.png'),
        (await win.webContents.capturePage()).toPNG()
      )
      await js(
        `[...document.querySelectorAll('.legal-tabs button')].find(button=>button.textContent==='Terceros').click()`
      )
      await wait(60)
      assert.match(await js('document.querySelector(".legal-text").textContent'), /react 19\.3\.1/)
      await click('[aria-label="Cerrar documentos legales"]')
      await nav('Explorar voces')
      assert.match(
        await js('document.querySelector(".external-voice-panel").innerText'),
        /voces compatibles instaladas en Windows/
      )
      await js('window.scrollTo(0,0);document.querySelector(".main-content").scrollTop=0;void 0')
      await wait(100)
      await fs.writeFile(
        path.join(root, 'voices.png'),
        (await win.webContents.capturePage()).toPNG()
      )
      console.log(
        'PASS: deletion respects confirmation; profiles persist after reload; legal documents and neutral voice copy are available'
      )
      await fs.writeFile(
        path.join(root, 'result.json'),
        JSON.stringify(
          { ok: true, profiles: disk.profiles.length, settings: edited.settings },
          null,
          2
        )
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
const entry = process.env.FABULA_CHECK_ASAR
  ? path.join(process.env.FABULA_CHECK_ASAR, 'out/main/index.js')
  : path.resolve('out/main/index.js')
import(pathToFileURL(entry).href).catch((error) => {
  console.error(error)
  app.exit(1)
})
