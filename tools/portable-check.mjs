// No npm dependencies: can verify Fabula.exe after removing node_modules/out/.build.
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
const root = resolve(process.env.FABULA_PORTABLE_CHECK_ROOT || '.tools/portable-check'),
  data = join(root, 'profile')
await mkdir(data, { recursive: true })
await rm(join(data, 'DevToolsActivePort'), { force: true })
if (process.env.FABULA_SEED_LANGUAGE)
  await writeFile(
    join(data, 'preferences.json'),
    JSON.stringify({ language: process.env.FABULA_SEED_LANGUAGE })
  )
const expectedLanguage = process.env.FABULA_EXPECT_LANGUAGE
const { version: expectedVersion } = JSON.parse(await readFile('package.json', 'utf8'))
const executable = resolve(process.env.FABULA_EXECUTABLE || 'Fabula.exe')
const child = spawn(executable, ['--remote-debugging-port=0', `--user-data-dir=${data}`], {
  windowsHide: true,
  stdio: 'ignore',
  env: { ...process.env, FABULA_TEST_MODE: '1', FABULA_DATA_DIR: data }
})
let socket
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(fn, label, timeout = 90000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try {
      const value = await fn()
      if (value) return value
    } catch {}
    await wait(150)
  }
  throw new Error(`Timeout: ${label}`)
}
try {
  const port = await until(async () => {
    const value = await readFile(join(data, 'DevToolsActivePort'), 'utf8')
    return Number(value.split('\n')[0])
  }, 'portable debug endpoint')
  const target = await until(async () => {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    return list.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
  }, 'portable page')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let counter = 0
  function call(method, params = {}) {
    const id = ++counter
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.removeEventListener('message', listener)
        reject(new Error(`CDP timeout: ${method}`))
      }, 30000)
      const listener = (event) => {
        const message = JSON.parse(event.data)
        if (message.id !== id) return
        clearTimeout(timer)
        socket.removeEventListener('message', listener)
        message.error ? reject(new Error(message.error.message)) : resolve(message.result)
      }
      socket.addEventListener('message', listener)
      socket.send(JSON.stringify({ id, method, params }))
    })
  }
  const ready = await until(async () => {
    const response = await call('Runtime.evaluate', {
      expression:
        '!!window.fabula && ["Borrador guardado","Draft saved"].includes(document.querySelector(".autosave")?.textContent)',
      returnByValue: true
    })
    return response.result?.value
  }, 'portable renderer')
  assert.ok(ready)
  const response = await call('Runtime.evaluate', {
    expression:
      'window.fabula.boot().then(state=>({voices:state.voices.length,preferences:!!state.preferences.pdfImport,version:document.title,language:state.preferences.language,htmlLanguage:document.documentElement.lang}))',
    awaitPromise: true,
    returnByValue: true
  })
  const result = response.result.value
  assert.ok(result.voices >= 15)
  assert.equal(result.preferences, true)
  assert.equal(result.htmlLanguage, result.language)
  if (expectedLanguage) assert.equal(result.language, expectedLanguage)
  const version = await call('Runtime.evaluate', {
    expression: `(()=>{[...document.querySelectorAll('button')].find(button=>['Acerca de Fábula','About Fábula'].some(text=>button.textContent.includes(text))).click();return true})()`,
    returnByValue: true
  })
  assert.equal(version.result.value, true)
  await wait(150)
  const about = await call('Runtime.evaluate', {
    expression: 'document.querySelector(".modal").innerText',
    returnByValue: true
  })
  assert.ok(about.result.value.includes('Fábula ' + expectedVersion))
  await writeFile(join(root, 'result.json'), JSON.stringify({ ok: true, ...result }, null, 2))
  console.log(
    'PASS: standalone Fabula.exe starts with its bundled runtime and dependencies; PDF preferences and voice catalogue available'
  )
  await call('Runtime.evaluate', { expression: 'window.close(); true' }).catch(() => {})
} finally {
  socket?.close()
  child.kill()
}
