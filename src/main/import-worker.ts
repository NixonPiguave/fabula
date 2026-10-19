import { t, setLanguage, normalizeLanguage, userError } from '../shared/i18n'
import { parentPort, workerData } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import { extname, dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from '@napi-rs/canvas'
import { createWorker, type Worker as OcrWorker } from 'tesseract.js'
import { documentText } from './import/formats'
import { pdfLines, type PdfPage, type PdfLine } from '../shared/pdf'

setLanguage(normalizeLanguage(workerData.uiLanguage) ?? 'es')

const { path, ocrPath } = workerData as { path: string; ocrPath?: string }
const ocrRequire = createRequire(import.meta.url)
let ocr: OcrWorker | null = null
let pageIndex = 0,
  pageCount = 1
function progress(phase: string, value: number) {
  parentPort!.postMessage({ kind: 'progress', phase, progress: value })
}
async function recognize(bytes: Uint8Array) {
  if (!ocrPath)
    throw new Error(
      t(
        'Este archivo necesita OCR. Instala el módulo OCR en Preferencias y usa «Importar con OCR».'
      )
    )
  if (!ocr)
    ocr = await createWorker('spa', 1, {
      workerPath: join(dirname(ocrRequire.resolve('tesseract.js')), 'worker-script/node/index.js'),
      corePath: dirname(ocrRequire.resolve('tesseract.js-core')),
      langPath: ocrPath,
      cachePath: ocrPath,
      gzip: false,
      cacheMethod: 'none',
      logger: (event) => {
        if (event.status === 'recognizing text')
          progress(
            t('Reconociendo página {0} de {1}', pageIndex + 1, pageCount),
            (pageIndex + event.progress) / pageCount
          )
      }
    })
  const result = await ocr.recognize(Buffer.from(bytes), {}, { text: true, blocks: true })
  const lines: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[] = []
  for (const block of result.data.blocks ?? [])
    for (const paragraph of block.paragraphs) for (const line of paragraph.lines) lines.push(line)
  return { text: result.data.text.trim(), lines }
}
async function main() {
  const extension = extname(path).toLowerCase()
  let text: string, pages: number | undefined
  const pdfPages: PdfPage[] = []
  try {
    if (['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.webp', '.bmp'].includes(extension))
      text = (await recognize(await readFile(path))).text
    else if (extension !== '.pdf') {
      progress(t('Extrayendo el texto del documento'), 0.1)
      text = await documentText(path)
    } else {
      const task = getDocument({ data: new Uint8Array(await readFile(path)), useSystemFonts: true })
      const document = await task.promise,
        parts: string[] = []
      pages = pageCount = document.numPages
      try {
        for (pageIndex = 0; pageIndex < document.numPages; pageIndex++) {
          const page = await document.getPage(pageIndex + 1),
            content = await page.getTextContent()
          const layout = page.getViewport({ scale: 1 })
          let lines: PdfLine[] = pdfLines(
            content.items.flatMap((item) => {
              if (!('str' in item)) return []
              const point = layout.convertToViewportPoint(item.transform[4], item.transform[5])
              return [
                {
                  str: item.str,
                  x: point[0],
                  y: point[1],
                  width: item.width,
                  height: item.height,
                  hasEOL: item.hasEOL
                }
              ]
            }),
            layout.width,
            layout.height
          )
          let pageText = content.items
            .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
            .join('')
            .trim()
          if (!pageText) {
            const viewport = page.getViewport({ scale: 2 }),
              width = Math.ceil(viewport.width),
              height = Math.ceil(viewport.height)
            if (!ocrPath)
              throw new Error(
                t(
                  'El PDF contiene páginas escaneadas. Usa «Importar con OCR» para extraerlas también.'
                )
              )
            if (
              !Number.isSafeInteger(width) ||
              !Number.isSafeInteger(height) ||
              width <= 0 ||
              height <= 0 ||
              width * height > 40_000_000
            )
              throw new Error(
                t(
                  'Una página es demasiado grande para OCR. Reduce su resolución y vuelve a intentarlo.'
                )
              )
            const canvas = createCanvas(width, height)
            await page.render({
              canvas: canvas as any,
              canvasContext: canvas.getContext('2d') as any,
              viewport
            }).promise
            const recognized = await recognize(await canvas.encode('png'))
            pageText = recognized.text
            lines = recognized.lines.map((line) => ({
              text: line.text,
              x: line.bbox.x0 / width,
              y: line.bbox.y0 / height,
              width: (line.bbox.x1 - line.bbox.x0) / width,
              height: (line.bbox.y1 - line.bbox.y0) / height
            }))
          }
          pdfPages.push({
            number: pageIndex + 1,
            lines,
            scanned: !content.items.some((item) => 'str' in item && item.str.trim())
          })
          parts.push(pageText)
          page.cleanup()
          progress(t('Página {0} de {1}', pageIndex + 1, pageCount), (pageIndex + 1) / pageCount)
        }
        text = parts.join('\n\n')
      } finally {
        await task.destroy()
      }
    }
    if (!text.trim())
      throw new Error(
        t('No se encontró texto en el documento. Revisa la calidad y la orientación del archivo.')
      )
    parentPort!.postMessage({
      kind: 'result',
      text: text.trim(),
      pages,
      pdf: pages ? { pages: pdfPages } : undefined
    })
  } finally {
    await ocr?.terminate()
  }
}
main().catch((error) => {
  parentPort!.postMessage({
    kind: 'error',
    error: userError(
      error,
      'No se pudo leer el documento. Comprueba que el archivo sea válido, no esté protegido y tenga un formato compatible.'
    )
  })
  process.exitCode = 1
})
