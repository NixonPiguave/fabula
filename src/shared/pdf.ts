import { z } from 'zod'

export const pdfOptionsSchema = z.object({
  includeHeader: z.boolean().default(false),
  includeFooter: z.boolean().default(false),
  topPercent: z.number().min(0).max(25).default(6),
  bottomPercent: z.number().min(0).max(25).default(6),
  removePageNumbers: z.boolean().default(true),
  removeRepeatedMargins: z.boolean().default(true)
})
export type PdfOptions = z.infer<typeof pdfOptionsSchema>
export const DEFAULT_PDF_OPTIONS = pdfOptionsSchema.parse({})
export type PdfLine = { text: string; x: number; y: number; width: number; height: number }
export type PdfPage = { number: number; lines: PdfLine[]; scanned?: boolean }
export type PdfDocument = { pages: PdfPage[] }
const pageNumber =
  /^(?:(?:p[aá]g(?:ina)?\.?|page)\s*)?(?:\d+|[ivxlcdm]+)(?:\s*(?:de|of|\/)\s*\d+)?$/iu
function marginKey(line: PdfLine) {
  if (line.y > 0.2 && line.y + line.height < 0.8) return null
  const text = line.text.trim().toLocaleLowerCase('es').replace(/\d+/g, '#').replace(/\s+/g, ' ')
  return text ? `${Math.round(line.y / 0.04)}:${text}` : null
}
export function pdfText(document: PdfDocument, options: PdfOptions) {
  const repeated = new Map<string, Set<number>>()
  if (options.removeRepeatedMargins)
    for (const page of document.pages)
      for (const line of page.lines) {
        const key = marginKey(line)
        if (key) {
          const pages = repeated.get(key) ?? new Set<number>()
          pages.add(page.number)
          repeated.set(key, pages)
        }
      }
  let excluded = 0
  const pageTexts = document.pages.map((page) => {
    const kept = page.lines.filter((line) => {
      const center = line.y + line.height / 2,
        top = center < 0.2,
        bottom = center > 0.8
      const outside =
        (!options.includeHeader && center < options.topPercent / 100) ||
        (!options.includeFooter && center > 1 - options.bottomPercent / 100)
      const numbered =
        options.removePageNumbers && (top || bottom) && pageNumber.test(line.text.trim())
      const key = marginKey(line),
        count = key ? (repeated.get(key)?.size ?? 0) : 0
      // Header/footer toggles also govern repeated-margin filtering for the respective region.
      const duplicate =
        options.removeRepeatedMargins &&
        ((top && !options.includeHeader) || (bottom && !options.includeFooter)) &&
        count >= 2 &&
        count >= document.pages.length * 0.3
      if (outside || numbered || duplicate) {
        excluded++
        return false
      }
      return true
    })
    return kept
      .map((line, index) => {
        const previous = kept[index - 1],
          gap = previous ? line.y - (previous.y + previous.height) : 0
        return (
          (index ? (gap > Math.max(line.height, previous.height) * 0.65 ? '\n\n' : '\n') : '') +
          line.text.trim()
        )
      })
      .join('')
  })
  return {
    text: pageTexts
      .filter((text) => text.trim())
      .join('\n\n')
      .trim(),
    pageTexts,
    excluded
  }
}

/** Convert PDF.js viewport-space text items to reading-order lines with normalized bounds. */
export function pdfLines(
  items: { str: string; x: number; y: number; width: number; height: number; hasEOL?: boolean }[],
  width: number,
  height: number
): PdfLine[] {
  const result: PdfLine[] = []
  let current: PdfLine | null = null
  const flush = () => {
    if (current?.text.trim()) result.push(current)
    current = null
  }
  for (const item of items) {
    if (!item.str.trim()) {
      if (item.hasEOL) flush()
      continue
    }
    const line = {
      text: item.str,
      x: item.x / width,
      y: (item.y - item.height) / height,
      width: item.width / width,
      height: Math.max(item.height / height, 0.001)
    }
    if (current && Math.abs(current.y - line.y) > Math.max(current.height, line.height) * 0.5)
      flush()
    if (!current) current = line
    else {
      const right = Math.max(current.x + current.width, line.x + line.width)
      current.text +=
        /\s$/.test(current.text) || /^\s/.test(line.text) ? line.text : ' ' + line.text
      current.x = Math.min(current.x, line.x)
      current.width = right - current.x
      current.height = Math.max(current.height, line.height)
    }
    if (item.hasEOL) flush()
  }
  flush()
  return result
}
