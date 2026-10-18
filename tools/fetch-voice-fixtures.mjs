import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const root = '.tools/voice-fixtures'
await mkdir(root, { recursive: true })
const files = [
  [
    'piper.zip',
    'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip',
    'f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea'
  ],
  [
    'es_ES-davefx-medium.onnx.json',
    'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx.json',
    '0e0dda87c732f6f38771ff274a6380d9252f327dca77aa2963d5fbdf9ec54842'
  ],
  [
    'es_ES-davefx-medium.onnx',
    'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx',
    '6658b03b1a6c316ee4c265a9896abc1393353c2d9e1bca7d66c2c442e222a917'
  ],
  [
    'MODEL_CARD',
    'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/MODEL_CARD',
    '420703b5d8ea239b729f13d83f31eea9bae5fcb89447de23ebc94aa8a4768f95'
  ]
]
for (const [name, url, expected] of files) {
  let bytes
  try {
    bytes = await readFile(`${root}/${name}`)
  } catch {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
    bytes = Buffer.from(await response.arrayBuffer())
    await writeFile(`${root}/${name}`, bytes)
  }
  const hash = createHash('sha256').update(bytes).digest('hex')
  if (hash !== expected) throw new Error(`Checksum mismatch: ${name}`)
  console.log(name, bytes.length, hash)
}
