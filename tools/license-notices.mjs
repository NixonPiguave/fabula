// Preserve upstream notices for dependencies, including code bundled into the renderer.
import { readFile, readdir, writeFile, access } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'

const root = resolve('.')
const seen = new Set(),
  records = [],
  missing = []
async function locate(from, name) {
  let folder = from
  for (;;) {
    const candidate = join(folder, 'node_modules', name, 'package.json')
    if (
      await access(candidate).then(
        () => true,
        () => false
      )
    )
      return dirname(candidate)
    if (folder === root || dirname(folder) === folder) return null
    folder = dirname(folder)
  }
}
async function visit(from, name, optional = false) {
  const folder = await locate(from, name)
  if (!folder) {
    if (!optional) throw Error(`Dependency missing: ${name}`)
    return
  }
  if (seen.has(folder)) return
  seen.add(folder)
  const pkg = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'))
  const paths = (await readdir(folder, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() && /^(?:licen[cs]e|copying|copyright|notice)(?:[._-].*)?$/i.test(entry.name)
    )
    .map((entry) => entry.name)
    .sort()
  let texts = await Promise.all(
    paths.map(async (file) => `${file}\n${await readFile(join(folder, file), 'utf8')}`)
  )
  if (!texts.length) {
    const readme = (await readdir(folder)).find((file) => /^readme(?:\.|$)/i.test(file))
    if (readme) {
      const content = await readFile(join(folder, readme), 'utf8')
      const section = content.match(
        /(?:^|\n)(?:#{1,6}\s+licen[cs]e\s*\n|licen[cs]e\s*\n-+\s*\n)([\s\S]*)$/i
      )?.[1]
      if (
        section &&
        /Permission is hereby granted/.test(section) &&
        /Copyright/i.test(section) &&
        /THE SOFTWARE IS PROVIDED/.test(section)
      )
        texts = [`${readme} · License\n${section}`]
    }
  }
  // Some binary packages rely on a separately preserved upstream license notice.
  const fallback = join(root, 'assets', 'licenses', `${pkg.name.replaceAll('/', '__')}.txt`)
  if (
    !texts.length &&
    (await access(fallback).then(
      () => true,
      () => false
    ))
  )
    texts = [await readFile(fallback, 'utf8')]
  if (!texts.length) missing.push(`${pkg.name}@${pkg.version}`)
  records.push({
    name: pkg.name,
    version: pkg.version,
    license:
      typeof pkg.license === 'string'
        ? pkg.license
        : JSON.stringify(pkg.license ?? 'consultar avisos'),
    texts
  })
  for (const [dependency] of Object.entries(pkg.dependencies ?? {}))
    await visit(folder, dependency, !!pkg.optionalDependencies?.[dependency])
  for (const [dependency] of Object.entries(pkg.optionalDependencies ?? {}))
    if (!pkg.dependencies?.[dependency]) await visit(folder, dependency, true)
}
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
for (const name of Object.keys(pkg.dependencies)) await visit(root, name)
if (missing.length) throw Error(`Missing original license notices: ${missing.join(', ')}`)
records.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
const header =
  'FÁBULA — LICENCIAS DE COMPONENTES\n\nAvisos originales de los paquetes de producción instalados para esta compilación.\nSe conservan en su idioma original. La etiqueta SPDX es informativa; prevalecen\nlos textos y condiciones de cada titular. Los avisos de Electron y Chromium se\nconservan también en LICENSE.electron.txt y LICENSES.chromium.html junto al\nprograma instalado. Consulta TERCEROS.txt para FFmpeg, voces y módulos opcionales.\n\n'
await writeFile(
  'LICENCIAS_DE_COMPONENTES.txt',
  header +
    records
      .map(
        (record) =>
          `${'='.repeat(72)}\n${record.name} ${record.version}\nLicencia declarada: ${record.license}\n${'='.repeat(72)}\n\n${record.texts.join('\n\n')}\n`
      )
      .join('\n')
)
console.log(`Licencias originales conservadas: ${records.length} paquetes de producción.`)
