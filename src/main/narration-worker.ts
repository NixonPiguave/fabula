import { parentPort, workerData } from 'node:worker_threads'
import { createWriteStream } from 'node:fs'
import { mkdir, stat, rename, writeFile, link, copyFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { join, basename } from 'node:path'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { atomicJson } from './core/files'
import { escapeXml } from './core/text'
import { narrationPlan, type Unit } from './core/plan'
import { command } from './core/process'
import type { JobRecord } from '../shared/types'
import type { VoiceRuntime } from './voices'
import { synthesizeLocal } from './core/external-speech'

const {
  job,
  dir,
  cache,
  ffmpeg,
  voices = []
} = workerData as {
  job: JobRecord
  dir: string
  cache: string
  ffmpeg: string
  voices?: VoiceRuntime[]
}
const manifest = join(dir, 'job.json')
async function update(fields: Partial<JobRecord>) {
  Object.assign(job, fields)
  await atomicJson(manifest, job)
  parentPort!.postMessage(job)
}
const onPid = (encoderPid: number | undefined) => parentPort!.postMessage({ encoderPid })
async function exists(path: string) {
  return stat(path)
    .then((info) => info.size > 100)
    .catch(() => false)
}
async function synthesize(unit: Unit, path: string) {
  const external = voices.find((voice) => voice.id === unit.settings.voice)
  if (external) return synthesizeLocal(unit, external, path, ffmpeg, onPid)
  for (let attempt = 0; attempt < 3; attempt++) {
    const tts = new MsEdgeTTS({ connectionTimeoutMs: 15000, synthesisTimeoutMs: 45000 })
    try {
      await tts.setMetadata(unit.settings.voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
      const { audioStream } = tts.toStream(escapeXml(unit.text), {
        rate: unit.settings.speed,
        pitch: `${unit.settings.pitch >= 0 ? '+' : ''}${unit.settings.pitch}Hz`,
        volume: Math.round(unit.settings.volume * 100)
      })
      await pipeline(audioStream, createWriteStream(`${path}.part`))
      if (!(await exists(`${path}.part`)))
        throw new Error('El servicio devolvió un fragmento vacío.')
      await rename(`${path}.part`, path)
      return
    } catch (error) {
      if (attempt === 2) throw error
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
    } finally {
      tts.close()
    }
  }
}

async function main() {
  await mkdir(dir, { recursive: true })
  await mkdir(cache, { recursive: true })
  const plan = narrationPlan(job)
  if (!plan.units.length) throw new Error('No hay texto que narrar.')
  await update({
    status: 'generating',
    completedChunks: 0,
    totalChunks: plan.units.length,
    cachedChunks: 0,
    error: undefined
  })
  const chapterEntries: string[][] = plan.chapters.map(() => [])
  for (let index = 0; index < plan.units.length; index++) {
    const unit = plan.units[index],
      cached = join(cache, `${unit.key}.mp3`),
      local = join(dir, `${unit.key}.mp3`)
    const reused = await exists(cached)
    if (!reused) await synthesize(unit, cached)
    if (!(await exists(local))) await link(cached, local).catch(() => copyFile(cached, local))
    chapterEntries[unit.chapter].push(`file '${basename(local)}'`)
    if (unit.pauseMs > 0) {
      const silence = `silence-${unit.pauseMs}.mp3`,
        path = join(dir, silence)
      if (!(await exists(path)))
        await command(
          ffmpeg,
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-y',
            '-f',
            'lavfi',
            '-i',
            'anullsrc=r=24000:cl=mono',
            '-t',
            String(unit.pauseMs / 1000),
            '-c:a',
            'libmp3lame',
            '-b:a',
            '96k',
            path
          ],
          { onPid }
        )
      chapterEntries[unit.chapter].push(`file '${silence}'`)
    }
    await update({
      completedChunks: index + 1,
      cachedChunks: (job.cachedChunks ?? 0) + (reused ? 1 : 0)
    })
  }
  await update({ status: 'merging' })
  const chapters = []
  let startSeconds = 0
  for (let index = 0; index < chapterEntries.length; index++) {
    if (!chapterEntries[index].length) continue
    const list = `chapter-${index}.txt`,
      file = `chapter-${index}.mp3`
    await writeFile(join(dir, list), chapterEntries[index].join('\n'), 'utf8')
    await command(
      ffmpeg,
      [
        '-hide_banner',
        '-y',
        '-f',
        'concat',
        '-safe',
        '1',
        '-i',
        list,
        '-c:a',
        'libmp3lame',
        '-b:a',
        '128k',
        '-metadata',
        `title=${plan.chapters[index].title}`,
        file
      ],
      { cwd: dir, onPid }
    )
    // FFmpeg reports its final timestamp on stderr; read duration from the encoded stream below.
    let duration = 0,
      diagnostics = ''
    await command(ffmpeg, ['-hide_banner', '-i', file, '-f', 'null', '-'], {
      cwd: dir,
      onPid,
      onStderr: (value) => {
        diagnostics = (diagnostics + value).slice(-2000)
        const match = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(diagnostics)
        if (match) duration = +match[1] * 3600 + +match[2] * 60 + +match[3]
      }
    })
    chapters.push({ title: plan.chapters[index].title, file, startSeconds })
    startSeconds += duration
  }
  await writeFile(
    join(dir, 'chapters.txt'),
    chapters.map((chapter) => `file '${chapter.file}'`).join('\n'),
    'utf8'
  )
  await command(
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
      'chapters.txt',
      '-c:a',
      'copy',
      '-metadata',
      `title=${job.title}`,
      'narration.partial.mp3'
    ],
    { cwd: dir, onPid }
  )
  await rename(join(dir, 'narration.partial.mp3'), join(dir, 'narration.mp3'))
  await update({ status: 'completed', chapters })
}
main().catch(async (error) => {
  await update({
    status: 'failed',
    error: `La narración no terminó. Puedes reanudarla conservando el audio ya generado. ${error instanceof Error ? error.message : String(error)}`
  }).catch(() => {})
  process.exitCode = 1
})
