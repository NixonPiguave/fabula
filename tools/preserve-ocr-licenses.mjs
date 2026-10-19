// Preserve the exact native sources referenced by the published OCR runtime.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
const root = '.tools/legal/ocr'
await mkdir(root, { recursive: true })
const revision = 'acffef2b66eb44a31df297e11d905f4b39001068'
async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) })
  if (!response.ok) throw Error(`${response.status}: ${url}`)
  return Buffer.from(await response.arrayBuffer())
}
function licenses(data) {
  const tar = gunzipSync(data),
    result = []
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, '')
    if (!name) break
    const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, '').trim(), 8)
    if (!Number.isSafeInteger(size) || size < 0) throw Error('Invalid archive entry')
    if (
      (/(?:^|\/)[^/]*(?:licen[sc]e|copying|copyright|notice)[^/]*$/i.test(name) &&
        !/\.(?:c|h|cpp|js|py|sh)$/i.test(name)) ||
      (/\/README(?:\.ijg)?$/.test(name) && name.split('/').length === 2)
    )
      result.push(name + '\n' + tar.subarray(offset + 512, offset + 512 + size).toString())
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return result
}
const tree = JSON.parse(
  (
    await get(
      `https://api.github.com/repos/naptha/tesseract.js-core/git/trees/${revision}:third_party`
    )
  ).toString()
)
const modules = tree.tree.filter((entry) => entry.mode === '160000')
if (modules.length !== 9) throw Error('Unexpected OCR native dependency inventory')
await writeFile(`${root}/submodules.json`, JSON.stringify(modules, null, 2))
const repositories = {
  giflib: 'mirrorer/giflib',
  leptonica: 'DanBloomberg/leptonica',
  libjpeg: 'LuaDist/libjpeg',
  libpng: 'glennrp/libpng',
  libtiff: 'libsdl-org/libtiff',
  libwebp: 'webmproject/libwebp',
  openlibm: 'JuliaMath/openlibm',
  tesseract: 'Balearica/tesseract',
  zlib: 'madler/zlib'
}
const sources = [
  { name: 'tesseract.js-core', repo: 'naptha/tesseract.js-core', sha: revision },
  ...modules.map((entry) => ({ name: entry.path, repo: repositories[entry.path], sha: entry.sha }))
]
const manifest = [],
  notices = []
for (const source of sources) {
  const file = `${source.name}-${source.sha.slice(0, 8)}.tar.gz`
  const url = `https://codeload.github.com/${source.repo}/tar.gz/${source.sha}`
  const data = await stat(`${root}/${file}`).then(
    () => readFile(`${root}/${file}`),
    () => get(url)
  )
  const original = licenses(data)
  if (!original.length) throw Error(`Missing original notice: ${source.name}`)
  await writeFile(`${root}/${file}`, data)
  manifest.push({ ...source, file, url, sha256: createHash('sha256').update(data).digest('hex') })
  notices.push(`${source.name}\n${url}\n${original.join('\n\n')}`)
  console.log('Preserved', file)
}
await writeFile(`${root}/manifest.json`, JSON.stringify(manifest, null, 2))
await writeFile(
  `${root}/README.txt`,
  'Unmodified upstream sources for tesseract.js-core 7.0.0 and its pinned native submodules. Original build scripts are in the tesseract.js-core archive. manifest.json records exact revisions, download locations and SHA-256 checksums.\n'
)
await writeFile(
  'assets/licenses/OCR-NATIVE-NOTICES.txt',
  'FÁBULA — OCR NATIVE COMPONENT NOTICES\n\n' + notices.join('\n\n' + '='.repeat(72) + '\n\n')
)
