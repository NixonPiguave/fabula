import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { unzipSync } from 'fflate'
const manifest = JSON.parse(await readFile('assets/audio-runtime.json', 'utf8'))
const root = '.tools/media-runtime'
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
if (
  await access(`${root}/ffmpeg.exe`).then(
    () => true,
    () => false
  )
) {
  const existing = await readFile(`${root}/ffmpeg.exe`)
  if (
    hash(existing) === manifest.executableSha256 &&
    (await access(`${root}/MINGW-NOTICES.txt`).then(
      () => true,
      () => false
    ))
  )
    process.exit(0)
}
const response = await fetch(manifest.url, { signal: AbortSignal.timeout(120000) })
if (!response.ok) throw Error(`Audio runtime download: HTTP ${response.status}`)
const bytes = new Uint8Array(await response.arrayBuffer())
if (hash(bytes) !== manifest.sha256) throw Error('Audio runtime checksum mismatch')
const files = unzipSync(bytes)
if (!files['ffmpeg.exe'] || hash(files['ffmpeg.exe']) !== manifest.executableSha256)
  throw Error('Unexpected audio executable')
await mkdir(root, { recursive: true })
for (const [name, content] of Object.entries(files)) {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw Error('Unexpected audio runtime archive path')
  await writeFile(`${root}/${name}`, content)
}
console.log('Audio runtime verified and installed for development/packaging.')
