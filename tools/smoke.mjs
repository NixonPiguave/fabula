import { Worker } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import ffmpeg from 'ffmpeg-static'

const root = resolve('.tools/smoke')
await mkdir(root, { recursive: true })

function runWorker(name, workerData, onMessage) {
  return new Promise((resolvePromise, reject) => {
    const worker = new Worker(resolve(`out/main/${name}.js`), { workerData })
    let latest
    worker.on('message', async (message) => {
      if (message.encoderPid) return
      latest = message
      if (onMessage) await onMessage(message, worker)
    })
    worker.once('error', reject)
    worker.once('exit', (code) => {
      if (!latest || latest.error || (code !== 0 && !latest.cancelledByTest))
        reject(new Error(latest?.error || `Worker exit ${code}`))
      else resolvePromise(latest)
    })
  })
}

// Produce a small real PDF with its own valid xref, no external fixture dependency.
function fixturePdf() {
  const stream =
    'BT /F1 14 Tf 50 750 Td (Historia de prueba: el dragon encontro a su hermano.) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ]
  let pdf = '%PDF-1.4\n',
    offsets = [0]
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return pdf
}

const pdfPath = join(root, 'fixture.pdf')
await writeFile(pdfPath, fixturePdf())
const extracted = await runWorker('pdf-worker', { path: pdfPath })
assert.match(extracted.text, /dragon encontro a su hermano/)
assert.equal(extracted.pages, 1)
console.log('PASS: actual PDF text extraction in background worker')

const id = randomUUID(),
  dir = join(root, id)
await mkdir(dir)
const text =
  'El joven abrió la puerta. «Hola, hermano», dijo. La historia continuaba, entre dragones & aventuras.\n\n'.repeat(
    31
  )
const job = {
  id,
  title: 'Prueba de narración',
  text,
  settings: { voice: 'es-MX-JorgeNeural', speed: 1.15, pitch: -10, volume: 1 },
  preview: false,
  status: 'generating',
  completedChunks: 0,
  totalChunks: 0,
  createdAt: new Date().toISOString(),
  words: text.split(/\s+/).length,
  characters: text.length,
  chunkVersion: 1
}
await writeFile(join(dir, 'job.json'), JSON.stringify(job))
let interrupted = false
const partial = await runWorker('speech-worker', { job, dir, ffmpeg }, async (message, worker) => {
  console.log(`Synthesis: ${message.status} ${message.completedChunks}/${message.totalChunks}`)
  if (!interrupted && message.completedChunks === 1 && message.totalChunks > 1) {
    interrupted = true
    message.cancelledByTest = true
    await worker.terminate()
  }
})
assert.ok(interrupted)
const chunkPath = join(dir, 'chunk-000000.mp3')
const before = (await stat(chunkPath)).mtimeMs
const saved = JSON.parse(await readFile(join(dir, 'job.json'), 'utf8'))
assert.equal(saved.completedChunks, 1)
console.log('PASS: interruption preserves completed chunk and manifest')

const completed = await runWorker('speech-worker', { job: saved, dir, ffmpeg }, (message) => {
  console.log(`Resume: ${message.status} ${message.completedChunks}/${message.totalChunks}`)
})
assert.equal(completed.status, 'completed')
assert.equal((await stat(chunkPath)).mtimeMs, before)
assert.ok((await stat(join(dir, 'narration.mp3'))).size > 10000)
const decode = spawnSync(
  ffmpeg,
  ['-hide_banner', '-v', 'error', '-i', join(dir, 'narration.mp3'), '-f', 'null', '-'],
  { encoding: 'utf8', windowsHide: true }
)
assert.equal(decode.status, 0, decode.stderr)
console.log('PASS: real Jorge narration, cached resume, FFmpeg assembly and MP3 decode')
console.log(`Output: ${join(dir, 'narration.mp3')}`)
