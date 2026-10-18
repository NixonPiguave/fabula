import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PDF_OPTIONS,
  pdfOptionsSchema,
  pdfText,
  pdfLines,
  type PdfDocument,
  type PdfLine
} from '../src/shared/pdf'
const line = (text: string, y: number, height = 0.02): PdfLine => ({
  text,
  x: 0.1,
  y,
  width: 0.7,
  height
})
const book: PdfDocument = {
  pages: [1, 2, 3].map((number) => ({
    number,
    lines: [
      line('CAPÍTULO 1 · LA CASA DE LOS DÍAS PEQUEÑOS', 0.025),
      line('Historia de una familia.', 0.2),
      line('Este párrafo es parte de la novela.', 0.24),
      line(String(number), 0.96)
    ]
  }))
}
describe('PDF margin extraction with a reviewable original', () => {
  it('omits running headers and folios while retaining the body on every page', () => {
    const result = pdfText(book, DEFAULT_PDF_OPTIONS)
    expect(result.excluded).toBe(6)
    expect(result.text.match(/Historia/g)).toHaveLength(3)
    expect(result.text).not.toContain('CAPÍTULO')
    expect(result.text).not.toMatch(/^1$/m)
    expect(book.pages[0].lines[0].text).toContain('CAPÍTULO')
  })
  it('includes header, footer and numbers when the user explicitly enables them', () => {
    const result = pdfText(book, {
      ...DEFAULT_PDF_OPTIONS,
      includeHeader: true,
      includeFooter: true,
      removePageNumbers: false
    })
    expect(result.excluded).toBe(0)
    expect(result.text).toContain('CAPÍTULO')
    expect(result.text).toMatch(/^3$/m)
  })
  it('detects a repeated running title below the crop while preserving a chapter heading in the body', () => {
    const pages = book.pages.map((page) => ({
      ...page,
      lines: [
        line('Un título repetido', 0.09),
        line('Capítulo 1', 0.25),
        line('42', 0.5),
        line('Página ' + page.number, 0.93)
      ]
    }))
    const result = pdfText({ pages }, { ...DEFAULT_PDF_OPTIONS, topPercent: 3, bottomPercent: 3 })
    expect(result.text).not.toContain('repetido')
    expect(result.text).not.toContain('Página')
    expect(result.text).toContain('42')
    expect(result.text).toContain('Capítulo 1')
  })
  it('applies independently configurable margins to OCR line boxes too', () => {
    const document = {
      pages: [
        {
          number: 1,
          scanned: true,
          lines: [line('Cabecera', 0.12), line('Centro', 0.4), line('Pie', 0.86)]
        }
      ]
    }
    expect(
      pdfText(document, { ...DEFAULT_PDF_OPTIONS, topPercent: 16, bottomPercent: 16 }).text
    ).toBe('Centro')
    expect(pdfOptionsSchema.safeParse({ topPercent: 90 }).success).toBe(false)
  })
  it('joins multiple PDF text items on one line without discarding their positions', () => {
    const lines = pdfLines(
      [
        { str: 'Una', x: 10, y: 40, width: 25, height: 10 },
        { str: 'historia.', x: 40, y: 40, width: 60, height: 10, hasEOL: true },
        { str: 'Continúa.', x: 10, y: 80, width: 80, height: 10 }
      ],
      200,
      400
    )
    expect(lines).toHaveLength(2)
    expect(lines[0].text).toBe('Una historia.')
    expect(lines[0].y).toBe(0.075)
    expect(lines[1].y).toBe(0.175)
  })
})
