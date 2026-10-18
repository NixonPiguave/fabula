// Capture the real application with fictional content and a separate data directory.
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve, join } from 'node:path'

const root = resolve('.tools/public-demo', randomUUID()),
  data = join(root, 'profile')
await mkdir(data, { recursive: true })
const project = {
  id: randomUUID(),
  name: 'Biblioteca de lecturas',
  color: '#a1ecc3',
  createdAt: new Date().toISOString()
}
const settings = { voice: 'es-MX-JorgeNeural', speed: 1, pitch: 0, volume: 1 }
const text = `Capítulo 1 · El jardín de las estaciones

Al llegar la primavera, Clara abrió la puerta del antiguo invernadero. La luz de la mañana atravesaba los cristales y dibujaba pequeñas islas doradas sobre las mesas de madera. Todo parecía esperar una primera palabra.

Sobre un banco encontró el cuaderno de su abuelo. Entre sus páginas había semillas, dibujos de plantas y una nota escrita con paciencia: «Un jardín no se termina. Se aprende a cuidarlo».

Clara decidió empezar por el sendero que conducía a la fuente. Recogió las hojas secas, acomodó las macetas y dejó que el silencio le contara lo que el lugar había conservado durante tantos inviernos.

Aquella tarde comprendió que algunas historias crecen despacio. Basta con volver a ellas, darles tiempo y encontrar una voz para compartirlas.`
await writeFile(
  join(data, 'draft.json'),
  JSON.stringify({
    title: 'El jardín de las estaciones',
    text,
    settings,
    pauseMs: 350,
    projectId: project.id
  })
)
await writeFile(
  join(data, 'library.json'),
  JSON.stringify({ projects: [project], assignments: {} })
)
await writeFile(
  join(data, 'preferences.json'),
  JSON.stringify({
    profiles: [
      {
        id: randomUUID(),
        name: 'Lectura tranquila',
        settings: { ...settings, speed: 0.9, pitch: -3 },
        pauseMs: 750
      },
      {
        id: randomUUID(),
        name: 'Lectura ágil',
        settings: { ...settings, voice: 'es-MX-DaliaNeural', speed: 1.15 },
        pauseMs: 350
      }
    ]
  })
)
const child = spawn(
  resolve(process.env.FABULA_EXECUTABLE || 'Fabula.exe'),
  ['--remote-debugging-port=0', `--user-data-dir=${data}`],
  {
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, FABULA_TEST_MODE: '1', FABULA_DATA_DIR: data }
  }
)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(fn, label) {
  const started = Date.now()
  while (Date.now() - started < 60000) {
    try {
      const value = await fn()
      if (value) return value
    } catch {}
    await wait(100)
  }
  throw Error(`Timeout: ${label}`)
}
let socket
try {
  const port = await until(
    async () => Number((await readFile(join(data, 'DevToolsActivePort'), 'utf8')).split('\n')[0]),
    'debug endpoint'
  )
  const target = await until(
    async () =>
      (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(
        (item) => item.type === 'page'
      ),
    'page'
  )
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let counter = 0
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++counter
      const timer = setTimeout(() => {
        socket.removeEventListener('message', listener)
        reject(Error(`CDP timeout: ${method}`))
      }, 15000)
      const listener = (event) => {
        const response = JSON.parse(event.data)
        if (response.id !== id) return
        clearTimeout(timer)
        socket.removeEventListener('message', listener)
        response.error ? reject(Error(response.error.message)) : resolve(response.result)
      }
      socket.addEventListener('message', listener)
      socket.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const response = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (response.exceptionDetails) throw Error(response.exceptionDetails.text)
    return response.result?.value
  }
  await until(
    () => evaluate('document.querySelector(".autosave")?.textContent === "Borrador guardado"'),
    'renderer'
  )
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false
  })
  await evaluate('document.fonts.ready.then(()=>true)')
  const capture = async (name) => {
    await wait(250)
    const picture = await call('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    })
    await writeFile(resolve('docs/screenshots', name), Buffer.from(picture.data, 'base64'))
    console.log(`Captura: ${name}`)
  }
  const nav = async (name) => {
    await evaluate(
      `[...document.querySelectorAll('nav button')].find(button=>button.textContent.includes(${JSON.stringify(name)})).click()`
    )
    await wait(150)
  }
  await capture('studio.png')
  await nav('Preferencias')
  await evaluate('document.querySelector(".voice-profiles").scrollIntoView({block:"start"});true')
  await capture('profiles.png')
  await evaluate(
    `(()=>{const select=document.querySelector('.setting-line select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'light');select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`
  )
  await capture('profiles-light.png')
  await evaluate(
    `(()=>{const select=document.querySelector('.setting-line select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'dark');select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`
  )
  await nav('Explorar voces')
  await evaluate('document.querySelector(".main-content").scrollTop=0;true')
  await capture('external-voices.png')
  await evaluate(
    `[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Acerca de Fábula')).click();true`
  )
  await wait(100)
  await evaluate(
    `[...document.querySelectorAll('.modal button')].find(button=>button.textContent==='Privacidad y licencias').click();true`
  )
  await capture('privacy-licenses.png')
  await evaluate('window.close();true').catch(() => {})
} finally {
  socket?.close()
  child.kill()
}
