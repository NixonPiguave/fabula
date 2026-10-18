import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const root = '.tools/module-downloads'
await mkdir(root, { recursive: true })
const assets = [
  [
    'whisper.zip',
    'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip',
    '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb'
  ],
  [
    'spa.traineddata',
    'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/spa.traineddata',
    '6f2e04d02774a18f01bed44b1111f2cd7f3ba7ac9dc4373cd3f898a40ea6b464'
  ],
  [
    'ggml-base.bin',
    'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe'
  ]
]
await Promise.all(
  assets.map(async ([name, url, expected]) => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer()),
      sha256 = createHash('sha256').update(bytes).digest('hex')
    if (expected && sha256 !== expected) throw new Error(`Checksum mismatch: ${name}`)
    await writeFile(`${root}/${name}`, bytes)
    console.log(JSON.stringify({ name, bytes: bytes.length, sha256 }))
  })
)
