import { readFile } from 'node:fs/promises'
import { posix, extname } from 'node:path'
import { unzipSync } from 'fflate'
import { XMLParser } from 'fast-xml-parser'
import { convert } from 'html-to-text'
import { createRequire } from 'node:module'
import { stripUnicodeFallback, rtfPlain } from './rtf'
const documentRequire = createRequire(import.meta.url)
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder('utf-16le').decode(bytes).replace(/^\uFEFF/, '')
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder('utf-16be').decode(bytes).replace(/^\uFEFF/, '')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

function parseXml(value: string, preserveOrder = false): any {
  if (/<!DOCTYPE|<!ENTITY/i.test(value))
    throw new Error('El documento XML contiene declaraciones no admitidas.')
  return new XMLParser({
    ignoreAttributes: false,
    preserveOrder,
    trimValues: false,
    parseTagValue: false,
    removeNSPrefix: true
  }).parse(value)
}
function archive(data: Uint8Array) {
  let expanded = 0
  return unzipSync(data, {
    filter: (file) => {
      if (!/\.(?:xml|opf|xhtml|html|htm)$/i.test(file.name)) return false
      if (file.originalSize > 64 * 1024 * 1024)
        throw new Error('Una sección del documento supera el tamaño seguro de extracción (64 MB).')
      expanded += file.originalSize
      if (expanded > 128 * 1024 * 1024)
        throw new Error(
          'El documento contiene demasiados datos de texto descomprimidos para importarlo de forma segura (128 MB).'
        )
      return true
    }
  })
}
function xmlParagraphs(nodes: any[], paragraphNames: string[]): string {
  function walk(items: any[]): string {
    let output = ''
    for (const node of items)
      for (const [key, value] of Object.entries(node)) {
        if (key === ':@' || ['del', 'instrText', 'script', 'style', 'binary-data'].includes(key))
          continue
        if (key === '#text') output += String(value)
        else if (key === 'tab') output += '\t'
        else if (key === 'br' || key === 'line-break') output += '\n'
        else if (key === 's')
          output += ' '.repeat(Math.min(100, Number((node[':@'] as any)?.['@_c']) || 1))
        else if (Array.isArray(value)) {
          const content = walk(value)
          output += content + (paragraphNames.includes(key) ? '\n\n' : '')
        }
      }
    return output
  }
  return walk(nodes).trim()
}
export function htmlText(html: string) {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'img', format: 'skip' },
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'h1', options: { uppercase: false } },
      { selector: 'h2', options: { uppercase: false } }
    ],
    limits: { maxInputLength: 64 * 1024 * 1024 }
  }).trim()
}
export async function documentText(path: string): Promise<string> {
  const bytes = await readFile(path),
    extension = extname(path).toLowerCase()
  if (['.txt', '.md'].includes(extension)) return decodeText(bytes)
  if (['.html', '.htm', '.xhtml'].includes(extension)) return htmlText(decodeText(bytes))
  if (extension === '.rtf') {
    const parser = documentRequire('rtf-parser')
    const document: any = await new Promise((resolve, reject) =>
      parser.string(
        stripUnicodeFallback(bytes.toString('latin1')),
        (error: Error | null, value: any) => (error ? reject(error) : resolve(value))
      )
    )
    return rtfPlain(document.content).trim()
  }
  const zip = archive(bytes)
  function entry(name: string) {
    const content = zip[name]
    if (!content) throw new Error(`Falta una sección del documento: ${name}`)
    return decodeText(content)
  }
  if (extension === '.docx') return xmlParagraphs(parseXml(entry('word/document.xml'), true), ['p'])
  if (extension === '.odt') return xmlParagraphs(parseXml(entry('content.xml'), true), ['p', 'h'])
  if (extension === '.epub') {
    if (
      zip['META-INF/encryption.xml'] &&
      /\.(?:xhtml|html|htm)(?:["'#?\s<]|$)/i.test(entry('META-INF/encryption.xml'))
    )
      throw new Error('El texto del EPUB está cifrado o protegido y no se puede extraer.')
    const container = parseXml(entry('META-INF/container.xml'))
    const rootfiles = container.container?.rootfiles?.rootfile
    const rootfile = (Array.isArray(rootfiles) ? rootfiles[0] : rootfiles)?.['@_full-path']
    if (typeof rootfile !== 'string')
      throw new Error('El EPUB no contiene un índice de lectura válido.')
    const opf = parseXml(entry(rootfile)),
      pkg = opf.package
    const items = Array.isArray(pkg?.manifest?.item)
      ? pkg.manifest.item
      : [pkg?.manifest?.item].filter(Boolean)
    const references = Array.isArray(pkg?.spine?.itemref)
      ? pkg.spine.itemref
      : [pkg?.spine?.itemref].filter(Boolean)
    const sections: string[] = []
    for (const reference of references) {
      if (reference['@_linear'] === 'no') continue
      const item = items.find((item: any) => item['@_id'] === reference['@_idref'])
      if (!item || !/xhtml|html/.test(item['@_media-type'] ?? '')) continue
      const href = decodeURIComponent(String(item['@_href']).split('#')[0])
      if (/^[a-z]+:/i.test(href))
        throw new Error('El EPUB contiene una referencia externa no admitida.')
      const name = posix.normalize(posix.join(posix.dirname(rootfile), href))
      if (name.startsWith('../')) throw new Error('El EPUB contiene una ruta inválida.')
      sections.push(htmlText(entry(name)))
    }
    if (!sections.length) throw new Error('No se encontraron capítulos de texto en el EPUB.')
    return sections.join('\n\n')
  }
  throw new Error('Formato de documento no admitido.')
}
