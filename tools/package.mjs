import { build, Platform } from 'electron-builder'
import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const installer = process.argv.includes('--installer')
const all = process.argv.includes('--all')
process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL ??= '5'
const artifacts = process.argv.includes('--copy-only')
  ? (await readdir('.build')).map((name) => `.build/${name}`)
  : await build({
      targets: Platform.WINDOWS.createTarget(
        all ? ['portable', 'nsis'] : installer ? 'nsis' : 'portable'
      ),
      publish: 'never'
    })
const failures = []
for (const kind of all ? ['portable', 'installer'] : [installer ? 'installer' : 'portable']) {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'))
  const executable = artifacts.find((path) =>
    path.endsWith(
      kind === 'installer' ? `Fabula-Setup-${version}.exe` : `Fabula-${version}-Windows.exe`
    )
  )
  if (!executable) throw new Error(`No se generó el ejecutable ${kind}.`)
  const destination = kind === 'installer' ? 'Fabula-Instalador.exe' : 'Fabula.exe'
  try {
    await copyFile(executable, destination)
    const hash = createHash('sha256')
      .update(await readFile(destination))
      .digest('hex')
    await writeFile(`${destination}.sha256`, `${hash}  ${destination}\n`)
    console.log(`Listo: ${destination} (en la carpeta raíz del proyecto).`)
  } catch (error) {
    failures.push(
      new Error(
        `No se pudo actualizar ${destination}. Cierra Fábula y ejecuta node tools/package.mjs --all --copy-only para copiar los paquetes ya generados.`,
        { cause: error }
      )
    )
  }
}
if (failures.length)
  throw new AggregateError(failures, failures.map((error) => error.message).join('\n'))
