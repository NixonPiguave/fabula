import { writeFile, rename, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.tmp`
  await writeFile(temp, JSON.stringify(value), 'utf8')
  await rename(temp, path)
}

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'))
}
export function safeName(value: string): string {
  let name =
    value
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .slice(0, 120)
      .replace(/[. ]+$/g, '') || 'Sin título'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`
  return name
}
