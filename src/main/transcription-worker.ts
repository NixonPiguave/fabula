import { t, setLanguage, normalizeLanguage } from '../shared/i18n'
import { parentPort, workerData } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'
import { availableParallelism } from 'node:os'
import { command } from './core/process'
import type { Transcript } from '../shared/studio'

setLanguage(normalizeLanguage(workerData.uiLanguage) ?? 'es')

const { path, dir, modulePath, ffmpeg, language, id } = workerData as {
  path: string
  dir: string
  modulePath: string
  ffmpeg: string
  language: string
  id: string
}
const onPid = (encoderPid: number | undefined) => parentPort!.postMessage({ encoderPid })
function progress(phase: string, progress: number) {
  parentPort!.postMessage({ kind: 'progress', phase, progress })
}
async function main() {
  const wav = join(dir, 'input.wav'),
    output = join(dir, 'transcript')
  progress(t('Preparando el audio'), 0.02)
  await command(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      path,
      '-vn',
      '-ar',
      '16000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      wav
    ],
    { onPid }
  )
  progress(t('Transcribiendo localmente'), 0.08)
  await command(
    join(modulePath, 'whisper-cli.exe'),
    [
      '-m',
      join(modulePath, 'ggml-base.bin'),
      '-f',
      wav,
      '-l',
      language,
      '-t',
      String(Math.max(1, Math.min(6, availableParallelism() - 1))),
      '-ng',
      '-oj',
      '-of',
      output,
      '-pp'
    ],
    {
      cwd: modulePath,
      onPid,
      onStderr: (value) => {
        const match = /progress\s*=\s*(\d+)%/.exec(value)
        if (match) progress(t('Transcribiendo localmente'), 0.08 + (+match[1] / 100) * 0.9)
      }
    }
  )
  const result = JSON.parse(await readFile(`${output}.json`, 'utf8'))
  const segments = (result.transcription ?? [])
    .map((entry: any) => ({
      start: Number(entry.offsets.from) / 1000,
      end: Number(entry.offsets.to) / 1000,
      text: String(entry.text).trim()
    }))
    .filter(
      (entry: any) => entry.text && Number.isFinite(entry.start) && Number.isFinite(entry.end)
    )
  if (!segments.length)
    throw new Error(t('No se detectó voz. Comprueba el archivo y el idioma elegido.'))
  const transcript: Transcript = {
    id,
    title: basename(path, extname(path)).slice(0, 160),
    text: segments.map((entry: any) => entry.text).join('\n'),
    segments,
    createdAt: new Date().toISOString()
  }
  parentPort!.postMessage({ kind: 'result', transcript })
}
main().catch((error) => {
  parentPort!.postMessage({
    kind: 'error',
    error: error instanceof Error ? error.message : String(error)
  })
  process.exitCode = 1
})
