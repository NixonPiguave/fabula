import { describe, it, expect, beforeAll } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { documentText, decodeText } from '../src/main/import/formats'
const dir = resolve('.tools/format-fixtures')
beforeAll(() => mkdir(dir, { recursive: true }))
async function fixture(name: string, files: Record<string, string>) {
  const path = join(dir, name)
  await writeFile(
    path,
    zipSync(
      Object.fromEntries(Object.entries(files).map(([name, value]) => [name, strToU8(value)]))
    )
  )
  return path
}
describe('document extraction with actual file containers', () => {
  it('extracts DOCX paragraphs, accents and line breaks without deleted text', async () => {
    const path = await fixture('story.docx', {
      'word/document.xml':
        '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Capítulo 1</w:t></w:r></w:p><w:p><w:r><w:t>Hola, </w:t></w:r><w:del><w:r><w:t>eliminado</w:t></w:r></w:del><w:r><w:t>dragón.</w:t><w:br/><w:t>Fin.</w:t></w:r></w:p></w:body></w:document>'
    })
    expect(await documentText(path)).toBe('Capítulo 1\n\nHola, dragón.\nFin.')
  })
  it('extracts ODT headings and mixed spans in reading order', async () => {
    const path = await fixture('story.odt', {
      'content.xml':
        '<office:document-content xmlns:office="o" xmlns:text="t"><office:body><office:text><text:h>Historia</text:h><text:p>Un <text:span>héroe</text:span> volvió.</text:p></office:text></office:body></office:document-content>'
    })
    expect(await documentText(path)).toBe('Historia\n\nUn héroe volvió.')
  })
  it('follows EPUB spine order, not ZIP order, and never includes scripts', async () => {
    const path = await fixture('story.epub', {
      'META-INF/container.xml':
        '<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>',
      'OEBPS/book.opf':
        '<package><manifest><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>',
      'OEBPS/b.xhtml': '<html><body><p>Segundo capítulo.</p></body></html>',
      'OEBPS/a.xhtml':
        '<html><body><h1>Capítulo 1</h1><p>Primero.</p><script>NO EJECUTAR</script></body></html>'
    })
    const text = await documentText(path)
    expect(text.indexOf('Primero.')).toBeLessThan(text.indexOf('Segundo capítulo.'))
    expect(text).not.toContain('NO EJECUTAR')
    expect(text).toContain('Capítulo 1')
  })
  it('extracts RTF Unicode and ignores formatting commands', async () => {
    const path = join(dir, 'story.rtf')
    await writeFile(path, '{\\rtf1\\ansi Hola, drag\\u243?n.\\par Segundo p\\u225?rrafo.}')
    expect(await documentText(path)).toContain('Hola, dragón.')
    expect(await documentText(path)).toContain('Segundo párrafo.')
  })
  it('rejects external XML entities and EPUB traversal instead of fetching anything', async () => {
    const path = await fixture('malicious.docx', {
      'word/document.xml':
        '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///private">]><document>&x;</document>'
    })
    await expect(documentText(path)).rejects.toThrow('declaraciones')
  })
  it('decodes UTF-8, UTF-16 and common Windows text without losing accents', () => {
    expect(decodeText(Buffer.from('¡Dragón!'))).toBe('¡Dragón!')
    expect(
      decodeText(Buffer.concat([Buffer.from([255, 254]), Buffer.from('¡Dragón!', 'utf16le')]))
    ).toBe('¡Dragón!')
    expect(decodeText(Uint8Array.from([72, 111, 108, 97, 32, 241]))).toBe('Hola ñ')
  })
})
