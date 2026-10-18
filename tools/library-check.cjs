// Real Electron UI/IPC check. Only fictional narrations in this isolated profile are recycled.
const { app, dialog } = require('electron')
const fs = require('node:fs/promises')
const {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  copyFileSync,
  existsSync
} = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { pathToFileURL } = require('node:url')
const assert = require('node:assert/strict')
const root = path.resolve(
  process.env.FABULA_CHECK_ASAR ? '.tools/library-packaged' : '.tools/library-check'
)
mkdirSync(root, { recursive: true })
process.env.FABULA_DATA_DIR = path.join(root, 'profile')
process.env.FABULA_TEST_MODE = '1'
mkdirSync(process.env.FABULA_DATA_DIR, { recursive: true })
app.setPath('userData', process.env.FABULA_DATA_DIR)
app.setPath('sessionData', process.env.FABULA_DATA_DIR)
app.disableHardwareAcceleration()
const sourceRoot = [
  '.tools/packaged-check/profile/narrations',
  '.tools/desktop-check/profile/narrations'
]
  .map((item) => path.resolve(item))
  .find((item) => existsSync(item))
assert.ok(sourceRoot, 'Run npm run test:desktop once before this check')
const source = readdirSync(sourceRoot).find((id) => {
  try {
    return (
      JSON.parse(readFileSync(path.join(sourceRoot, id, 'job.json'), 'utf8')).status === 'completed'
    )
  } catch {
    return false
  }
})
assert.ok(source, 'Run npm run test:desktop once before this check')
const original = JSON.parse(readFileSync(path.join(sourceRoot, source, 'job.json'), 'utf8'))
const ids = [randomUUID(), randomUUID()]
for (let i = 0; i < ids.length; i++) {
  const folder = path.join(root, 'profile/narrations', ids[i])
  mkdirSync(folder, { recursive: true })
  writeFileSync(
    path.join(folder, 'job.json'),
    JSON.stringify({
      ...original,
      id: ids[i],
      title: i ? 'Una segunda aventura' : 'El comienzo de la saga',
      status: 'completed',
      preview: false
    })
  )
  copyFileSync(path.join(sourceRoot, source, 'narration.mp3'), path.join(folder, 'narration.mp3'))
}
const exported = path.join(root, `export-preserved-${ids[0]}.mp3`)
copyFileSync(path.join(sourceRoot, source, 'narration.mp3'), exported)
let answer = 0,
  prompts = 0
dialog.showMessageBox = async () => {
  prompts++
  return { response: answer, checkboxChecked: false }
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(fn, label, timeout = 120000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const value = await fn()
    if (value) return value
    await wait(80)
  }
  throw new Error(`Timeout: ${label}`)
}
app.once('browser-window-created', (_event, win) => {
  win.webContents.setAudioMuted(true)
  win.webContents.once('did-finish-load', async () => {
    const js = (source) => win.webContents.executeJavaScript(source)
    const boot = () => js('window.fabula.boot()')
    const click = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).click()`)
    const field = (selector, value, select = false) =>
      js(
        `(() => { const element=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(${select ? 'HTMLSelectElement' : 'HTMLInputElement'}.prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('${select ? 'change' : 'input'}',{bubbles:true})); })()`
      )
    const nav = (text) =>
      js(
        `[...document.querySelectorAll('nav button')].find(button=>button.textContent.includes(${JSON.stringify(text)})).click()`
      )
    try {
      await until(
        () =>
          js(
            '!!window.fabula && document.querySelector(".autosave")?.textContent === "Borrador guardado"'
          ),
        'boot'
      )
      await js('void(window.confirm=()=>true)')
      await nav('Tu biblioteca')
      await js(`document.querySelector('.project-section-heading .secondary-button').click()`)
      await until(() => js('!!document.querySelector(".project-dialog")'), 'new project dialog')
      const name = `Saga de prueba ${ids[0].slice(0, 8)}`
      await field('[aria-label="Nombre del proyecto"]', name)
      await js('document.querySelector(".project-dialog form").requestSubmit()')
      const project = await until(
        async () => (await boot()).library.projects.find((project) => project.name === name),
        'project saved'
      )
      await until(() => js('!document.querySelector(".project-dialog")'), 'project dialog closes')
      for (const id of ids)
        await field(`[data-job-id="${id}"] .narration-project select`, project.id, true)
      await until(async () => {
        const state = await boot()
        return ids.every((id) => state.library.assignments[id] === project.id)
      }, 'both assignments')
      await click(`[aria-label="Abrir proyecto ${name}"]`)
      await until(
        () => js(`document.querySelectorAll('.library-item').length===2`),
        'project filter'
      )
      console.log('PASS: create project and move two existing narrations through the UI')
      await click(`[aria-label="Editar proyecto ${name}"]`)
      const renamed = name + ' final'
      await field('[aria-label="Nombre del proyecto"]', renamed)
      await js('document.querySelector(".project-dialog form").requestSubmit()')
      await until(
        async () =>
          (await boot()).library.projects.find((item) => item.id === project.id)?.name === renamed,
        'rename'
      )
      await until(() => js('!document.querySelector(".project-dialog")'), 'rename closes')
      await js(
        `[...document.querySelectorAll('nav button')].find(button=>button.textContent.includes('Estudio de narración')).click()`
      )
      await field('[aria-label="Proyecto de la nueva narración"]', project.id, true)
      await until(async () => (await boot()).draft.projectId === project.id, 'draft membership')
      const otherState = await js(
        `window.fabula.saveProject({name:${JSON.stringify(name + ' otro')},color:'#9dcaff'})`
      )
      const other = otherState.projects.find((item) => item.name === name + ' otro')
      const generated = await js(
        `window.fabula.start({title:'Nueva narración del proyecto',text:'Una historia diferente comienza esta noche. El joven espera junto a la puerta.',projectId:${JSON.stringify(project.id)},settings:${JSON.stringify(original.settings)}})`
      )
      const promptCount = prompts
      assert.equal(
        await js(
          `window.fabula.deleteJob(${JSON.stringify(generated.id)}).then(()=>false,()=>true)`
        ),
        true
      )
      assert.equal(prompts, promptCount)
      await js(
        `window.fabula.assignProject(${JSON.stringify(generated.id)},${JSON.stringify(other.id)})`
      )
      await until(async () => {
        const job = (await boot()).jobs.find((item) => item.id === generated.id)
        if (job.status === 'failed') throw new Error(job.error)
        return job.status === 'completed'
      }, 'new project narration')
      assert.equal((await boot()).library.assignments[generated.id], other.id)
      console.log(
        'PASS: selected project on new narration; membership edits survive worker writes; active deletion is blocked'
      )
      await nav('Tu biblioteca')
      answer = 0
      await click(`[aria-label="Eliminar proyecto ${renamed}"]`)
      await wait(200)
      assert.ok((await boot()).library.projects.some((item) => item.id === project.id))
      answer = 1
      await click(`[aria-label="Eliminar proyecto ${renamed}"]`)
      await until(
        async () => !(await boot()).library.projects.some((item) => item.id === project.id),
        'project removal'
      )
      let state = await boot()
      assert.ok(ids.every((id) => state.jobs.some((job) => job.id === id)))
      assert.ok(ids.every((id) => !state.library.assignments[id]))
      assert.equal(state.draft.projectId, null)
      console.log(
        'PASS: cancelling project removal preserves it; removing project preserves all narrations and clears draft selection'
      )
      await until(
        () => js(`!!document.querySelector('[data-job-id="${ids[0]}"]')`),
        'unassigned rows'
      )
      await click(`[data-job-id="${ids[0]}"] .track-actions button`)
      await until(() => js('document.querySelector("audio").duration>1'), 'selected playback')
      answer = 0
      await click(`[data-job-id="${ids[0]}"] .danger-action`)
      await wait(250)
      assert.ok((await boot()).jobs.some((job) => job.id === ids[0]))
      assert.ok(await fs.stat(path.join(root, 'profile/narrations', ids[0])))
      answer = 1
      await click(`[data-job-id="${ids[0]}"] .danger-action`)
      await until(
        async () => !(await boot()).jobs.some((job) => job.id === ids[0]),
        'narration recycled'
      )
      await until(
        () => js('!document.querySelector("audio").getAttribute("src")'),
        'player cleared'
      )
      await assert.rejects(fs.stat(path.join(root, 'profile/narrations', ids[0])))
      assert.ok((await fs.stat(exported)).size > 1000)
      assert.ok(
        (await fs.stat(path.join(root, 'profile/narrations', ids[1], 'narration.mp3'))).size > 1000
      )
      assert.equal(await js(`window.fabula.deleteJob('../outside').then(()=>false,()=>true)`), true)
      console.log(
        'PASS: cancel keeps files; confirmed deletion uses Windows Recycle Bin, clears playback and preserves other/exported MP3s'
      )
      await nav('Preferencias')
      await click('[aria-label="Aplicar paleta Medianoche"]')
      await until(
        async () => (await boot()).preferences.customColors.background === '#101521',
        'palette persists'
      )
      await field('[aria-label="Color de fondo principal"]', '#f7e8dc')
      await field('[aria-label="Color de paneles y editor"]', '#ffffff')
      await field('[aria-label="Color de reproductor"]', '#263a59')
      await until(
        async () => (await boot()).preferences.customColors.player === '#263a59',
        'custom colors persist'
      )
      const styles = await js(
        `(() => { const p=getComputedStyle(document.querySelector('.feature-card')),w=getComputedStyle(document.querySelector('.workspace')),r=getComputedStyle(document.querySelector('.player')); return {panel:p.backgroundColor,panelText:p.color,background:w.backgroundColor,player:r.backgroundColor} })()`
      )
      assert.deepEqual(styles, {
        panel: 'rgb(255, 255, 255)',
        panelText: 'rgb(23, 32, 25)',
        background: 'rgb(247, 232, 220)',
        player: 'rgb(38, 58, 89)'
      })
      await js('document.querySelector(".toast .icon-button")?.click(); void 0')
      await wait(300)
      await fs.writeFile(
        path.join(root, 'colors.png'),
        (await win.webContents.capturePage()).toPNG()
      )
      await new Promise((resolve) => {
        win.webContents.once('did-finish-load', resolve)
        win.webContents.reload()
      })
      await until(
        () =>
          js(
            '!!window.fabula && document.querySelector(".autosave")?.textContent === "Borrador guardado"'
          ),
        'reload'
      )
      state = await boot()
      assert.equal(state.preferences.customColors.background, '#f7e8dc')
      assert.equal(state.library.assignments[generated.id], other.id)
      assert.equal(
        state.jobs.some((job) => job.id === ids[0]),
        false
      )
      assert.equal(state.playback.positions[ids[0]], undefined)
      assert.equal(state.playback.currentId === ids[0], false)
      await nav('Tu biblioteca')
      await js('document.querySelector(".toast .icon-button")?.click(); void 0')
      await wait(300)
      await fs.writeFile(
        path.join(root, 'projects.png'),
        (await win.webContents.capturePage()).toPNG()
      )
      console.log(
        'PASS: custom surface colors and readable text are applied and persist alongside projects after restart'
      )
      await fs.writeFile(
        path.join(root, 'result.json'),
        JSON.stringify(
          { ok: true, recycled: ids[0], preserved: ids[1], project: other.id, styles },
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
const entry = process.env.FABULA_CHECK_ASAR
  ? path.join(process.env.FABULA_CHECK_ASAR, 'out/main/index.js')
  : path.resolve('out/main/index.js')
import(pathToFileURL(entry).href).catch((error) => {
  console.error(error)
  app.exit(1)
})
