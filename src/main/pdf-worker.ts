import { parentPort, workerData } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

async function main() {
  const data = new Uint8Array(await readFile(workerData.path))
  const task = getDocument({ data, useSystemFonts: true })
  const document = await task.promise
  try {
    const pages: string[] = []
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i)
      const content = await page.getTextContent()
      let text = ''
      for (const item of content.items) {
        if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ')
      }
      pages.push(text.trim())
      page.cleanup()
    }
    const text = pages.join('\n\n').trim()
    if (!text)
      throw new Error(
        'Este PDF no contiene texto extraíble. Si es un escaneo, primero necesita reconocimiento de texto (OCR).'
      )
    parentPort!.postMessage({ text, pages: document.numPages })
  } finally {
    await task.destroy()
  }
}

main().catch((error) => {
  parentPort!.postMessage({ error: error instanceof Error ? error.message : String(error) })
  process.exitCode = 1
})
