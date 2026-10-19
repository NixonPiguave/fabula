// Generate a fictional audio fixture using an installed Windows SAPI voice.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const root = resolve('.tools/fixtures')
await mkdir(root, { recursive: true })
const script = resolve('assets/native/sapi.ps1')
const run = (request) => {
  const file = resolve(root, 'request.json')
  return writeFile(file, JSON.stringify(request)).then(() => {
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        script,
        '-RequestFile',
        file
      ],
      { encoding: 'utf8', windowsHide: true }
    )
    if (result.status !== 0) throw Error(result.stderr)
    return result.stdout.replace(/^\uFEFF/, '').trim()
  })
}
const voices = JSON.parse(await run({ operation: 'list' }))
const voice = voices.find((item) => item.locale.startsWith('es')) || voices[0]
if (!voice) throw Error('Install a Windows SAPI voice to generate audio fixtures')
const output = resolve(root, 'sample.wav')
await run({
  operation: 'speak',
  name: voice.name,
  output,
  ssml:
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="' +
    voice.locale +
    '">Aquella noche, Clara abrió la puerta del jardín. Su hermano la esperaba junto al camino. La historia acababa de comenzar.</speak>'
})
const result = spawnSync(
  resolve('.tools/media-runtime/ffmpeg.exe'),
  ['-v', 'error', '-y', '-i', output, '-c:a', 'libmp3lame', resolve(root, 'sample.mp3')],
  { encoding: 'utf8', windowsHide: true }
)
if (result.status !== 0) throw Error(result.stderr)
console.log('Local audio fixture created:', resolve(root, 'sample.mp3'))
