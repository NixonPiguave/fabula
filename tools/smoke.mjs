import { Worker } from 'node:worker_threads'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
const root = resolve('.tools/smoke')
await mkdir(root, { recursive: true })
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

await writeFile(resolve(root, 'fixture.pdf'), fixturePdf())
await new Promise((done, reject) => {
  const worker = new Worker(resolve('out/main/pdf-worker.js'), {
    workerData: { path: resolve(root, 'fixture.pdf') }
  })
  let result
  worker.on('message', (message) => {
    result = message
  })
  worker.once('error', reject)
  worker.once('exit', (code) => {
    try {
      assert.equal(code, 0)
      assert.match(result.text, /dragon encontro a su hermano/)
      done()
    } catch (error) {
      reject(error)
    }
  })
})
const ffmpeg = resolve('.tools/media-runtime/ffmpeg.exe')
const encoded = spawnSync(
  ffmpeg,
  [
    '-hide_banner',
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=24000:cl=mono',
    '-t',
    '0.5',
    '-af',
    'asetrate=22000,aresample=24000,atempo=1.1,volume=0.8',
    '-c:a',
    'libmp3lame',
    resolve(root, 'silence.mp3')
  ],
  { encoding: 'utf8', windowsHide: true }
)
assert.equal(encoded.status, 0, encoded.stderr)
const decoded = spawnSync(
  ffmpeg,
  ['-v', 'error', '-i', resolve(root, 'silence.mp3'), '-f', 'null', '-'],
  { encoding: 'utf8', windowsHide: true }
)
assert.equal(decoded.status, 0, decoded.stderr)
console.log('PASS: real PDF worker, local FFmpeg filters, MP3 encoding and decoding')
