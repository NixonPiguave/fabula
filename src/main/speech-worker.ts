import { parentPort, workerData } from 'node:worker_threads'
import { createWriteStream } from 'node:fs'
import { mkdir, stat, rename, writeFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { splitText, escapeXml } from './core/text'
import { atomicJson } from './core/files'
import type { JobRecord } from '../shared/types'

const { job, dir, ffmpeg } = workerData as { job: JobRecord; dir: string; ffmpeg: string }
const manifest = join(dir, 'job.json')

async function update(fields: Partial<JobRecord>) {
  Object.assign(job, fields)
  await atomicJson(manifest, job)
  parentPort!.postMessage(job)
}

async function synthesize(text: string, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const tts = new MsEdgeTTS({ connectionTimeoutMs: 15000, synthesisTimeoutMs: 45000 })
    try {
      await tts.setMetadata(job.settings.voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
      const { audioStream } = tts.toStream(escapeXml(text), {
        rate: job.settings.speed,
        pitch: `${job.settings.pitch >= 0 ? '+' : ''}${job.settings.pitch}Hz`,
        volume: Math.round(job.settings.volume * 100)
      })
      await pipeline(audioStream, createWriteStream(`${path}.part`))
      if ((await stat(`${path}.part`)).size < 100)
        throw new Error('El servicio devolvió audio vacío.')
      await rename(`${path}.part`, path)
      return
    } catch (error) {
      if (attempt === 2) throw error
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)))
    } finally {
      tts.close()
    }
  }
}

async function main() {
  await mkdir(dir, { recursive: true })
  const chunks = splitText(job.text)
  await update({
    status: 'generating',
    totalChunks: chunks.length,
    completedChunks: 0,
    error: undefined
  })
  for (let index = 0; index < chunks.length; index++) {
    const path = join(dir, `chunk-${String(index).padStart(6, '0')}.mp3`)
    const cached = await stat(path)
      .then((info) => info.size >= 100)
      .catch(() => false)
    if (!cached) await synthesize(chunks[index], path)
    await update({ completedChunks: index + 1 })
  }
  await update({ status: 'merging' })
  const entries = chunks
    .map((_, index) => `file 'chunk-${String(index).padStart(6, '0')}.mp3'`)
    .join('\n')
  await writeFile(join(dir, 'concat.txt'), entries, 'utf8')
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'concat',
        '-safe',
        '1',
        '-i',
        'concat.txt',
        '-map',
        '0:a:0',
        '-c:a',
        'copy',
        '-id3v2_version',
        '3',
        '-metadata',
        `title=${job.title}`,
        'narration.partial.mp3'
      ],
      { cwd: dir, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }
    )
    let error = ''
    child.stderr.on('data', (data) => {
      error = (error + data.toString()).slice(-3000)
    })
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`No se pudo ensamblar el MP3: ${error}`))
    )
    // Parent tracks this PID so cancellation and shutdown also stop the encoder.
    parentPort!.postMessage({ encoderPid: child.pid })
  })
  await rename(join(dir, 'narration.partial.mp3'), join(dir, 'narration.mp3'))
  await update({ status: 'completed' })
}

main().catch(async (error) => {
  const detail = error instanceof Error ? error.message : String(error)
  await update({
    status: 'failed',
    error: `No se pudo completar la narración. Comprueba tu conexión e inténtalo de nuevo. Los fragmentos terminados se conservan. Detalle: ${detail}`
  }).catch(() => {})
  process.exitCode = 1
})
