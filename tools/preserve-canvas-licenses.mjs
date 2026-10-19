// Preserve exact upstream Rust sources and native notices named by the supplied SBOM.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
const root = '.tools/legal/canvas'
await mkdir(`${root}/crates`, { recursive: true })
const bom = JSON.parse(await readFile('assets/licenses/canvas-sbom.json', 'utf8'))
const digest = (data) => createHash('sha256').update(data).digest('hex')
const binary = await readFile(
  'node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node'
)
if (digest(binary) !== bom.components[0].hashes[0].content)
  throw Error('Canvas binary differs from its SBOM')
async function get(url, optional = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
    if (optional && response.status === 404) return null
    if (response.ok) return Buffer.from(await response.arrayBuffer())
    if (attempt === 2) throw Error(`${response.status}: ${url}`)
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
  }
}
function tarEntries(gzip) {
  const tar = gunzipSync(gzip),
    files = []
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, '')
    if (!name) break
    const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, '').trim(), 8)
    if (!Number.isSafeInteger(size) || size < 0) throw Error('Invalid archive entry')
    const type = String.fromCharCode(header[156])
    if (type === '0' || type === '\0')
      files.push({ name, text: tar.subarray(offset + 512, offset + 512 + size).toString('utf8') })
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return files
}
const manifest = [],
  notices = []
const crates = bom.components.filter(
  (component) =>
    component.purl?.startsWith('pkg:cargo/') &&
    component.hashes?.length &&
    component.properties?.some(
      (p) => p.name === 'cdx:rust:source' && p.value.startsWith('registry+')
    )
)
for (const component of crates) {
  const name = `${component.name}-${component.version}.crate`
  const url = `https://static.crates.io/crates/${component.name}/${name}`
  const path = `${root}/crates/${name}`
  const data = await stat(path).then(
    () => readFile(path),
    () => get(url)
  )
  if (digest(data) !== component.hashes[0].content) throw Error(`Checksum mismatch: ${name}`)
  await writeFile(path, data)
  const entries = tarEntries(data)
  let licenseFiles = entries
    .filter((e) => /(?:^|\/)(?:licen[sc]e|copying|copyright|notice)(?:[._-][^/]*)?$/i.test(e.name))
    .map((e) => e.name + '\n' + e.text)
  if (!licenseFiles.length) {
    const vcs = entries.find((e) => e.name.endsWith('/.cargo_vcs_info.json'))
    const cargo = entries.find((e) => e.name.endsWith('/Cargo.toml'))
    const repo = cargo?.text.match(/^repository\s*=\s*"([^"]+)"/m)?.[1]
    if (vcs && repo?.startsWith('https://github.com/')) {
      const commit = JSON.parse(vcs.text).git.sha1
      for (const file of ['LICENSE', 'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE']) {
        const content = await get(
          repo.replace('https://github.com/', 'https://raw.githubusercontent.com/') +
            '/' +
            commit +
            '/' +
            file,
          true
        )
        if (content) licenseFiles.push(file + '\n' + content.toString())
      }
    }
  }
  if (!licenseFiles.length) throw Error(`Original license missing: ${name}`)
  manifest.push({
    name: component.name,
    version: component.version,
    url,
    sha256: digest(data),
    license: component.licenses
  })
  notices.push(`${component.name} ${component.version}\n${licenseFiles.join('\n\n')}`)
}
const native = bom.components.filter((component) => component.purl?.startsWith('pkg:generic/'))
for (const component of native) {
  const repo = component.properties.find(
    (property) => property.name === 'cdx:skia:repositoryUrl'
  )?.value
  const found = []
  for (const file of [
    'LICENSE',
    'LICENSE.txt',
    'LICENSE.md',
    'LICENSE.TXT',
    'COPYING',
    'COPYING.txt',
    'NOTICE',
    'NOTICE.md',
    'README.ijg',
    'docs/FTL.TXT'
  ]) {
    const url = `${repo.replace(/\.git$/, '')}/+/${component.version}/${file}?format=TEXT`
    const data = await get(url, true)
    if (data) found.push(`${file}\n${Buffer.from(data.toString(), 'base64').toString('utf8')}`)
  }
  if (!found.length) throw Error(`Native notices missing: ${component.name}`)
  notices.push(`${component.name} ${component.version}\nSource: ${repo}\n${found.join('\n\n')}`)
  manifest.push({
    name: component.name,
    commit: component.version,
    repository: repo,
    license: component.licenses
  })
}
const canvasCommit = 'adce718ec8ff82f9e896875752fd621c46b1c04e'
const tree = JSON.parse(
  (
    await get(`https://api.github.com/repos/Brooooooklyn/canvas/git/trees/${canvasCommit}`)
  ).toString()
)
const skiaCommit = tree.tree.find((entry) => entry.path === 'skia').sha
const skiaLicense = (
  await get(`https://raw.githubusercontent.com/google/skia/${skiaCommit}/LICENSE`)
).toString()
notices.push(`Skia ${skiaCommit}\n${skiaLicense}`)
manifest.push(
  { name: 'canvas', commit: canvasCommit, repository: 'https://github.com/Brooooooklyn/canvas' },
  { name: 'skia', commit: skiaCommit, repository: 'https://github.com/google/skia' }
)
await writeFile(
  `${root}/canvas-source.tar.gz`,
  await get(`https://codeload.github.com/Brooooooklyn/canvas/tar.gz/${canvasCommit}`)
)
await writeFile(
  `${root}/manifest.json`,
  JSON.stringify({ nativeBinarySha256: digest(binary), components: manifest }, null, 2)
)
await writeFile(
  `${root}/README.txt`,
  'Original source archives for the exact Rust components listed in the native canvas SBOM. Each .crate is a gzip-compressed tar archive containing the upstream source and license. MPL-2.0 source files are unmodified and remain available under MPL-2.0. No additional license restrictions apply to those source files. The manifest records checksums, revisions and native dependency repositories.\n'
)
await writeFile(
  'assets/licenses/CANVAS-NATIVE-NOTICES.txt',
  `FÁBULA — CANVAS NATIVE COMPONENT NOTICES\n\nPortions of this software are copyright © 2026 The FreeType Project (www.freetype.org). All rights reserved.\n\nMPL-2.0 component source: https://github.com/NixonPiguave/fabula/releases/tag/v0.7.0 (Fabula-Canvas-Sources.tar.gz).\nOriginal notices follow unchanged.\n\n${notices.join('\n\n' + '='.repeat(72) + '\n\n')}`
)
console.log(
  `Preserved ${crates.length} Rust source archives and ${native.length} native notice sets.`
)
