import { mkdir, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
const root = '.tools/fixtures'
await mkdir(root, { recursive: true })
const target = `${root}/jorge.mp3`
if (
  await stat(target)
    .then((info) => info.size > 1000)
    .catch(() => false)
)
  process.exit(0)
const tts = new MsEdgeTTS({ connectionTimeoutMs: 15000, synthesisTimeoutMs: 45000 })
try {
  await tts.setMetadata('es-MX-JorgeNeural', OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
  const { audioStream } = tts.toStream(
    'Aquella noche, el joven abrió los ojos y descubrió un mundo diferente. Su hermano lo esperaba junto a la puerta. No sabía qué les deparaba el destino, pero estaba decidido a proteger a su familia.'
  )
  await pipeline(audioStream, createWriteStream(target))
  console.log('Fixture ficticio creado:', target)
} finally {
  tts.close()
}
