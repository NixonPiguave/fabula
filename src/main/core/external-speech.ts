import { writeFile, rename, rm } from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import type { VoiceRuntime } from '../voices'
import type { Unit } from './plan'
import { escapeXml } from './text'
import { command } from './process'

export async function synthesizeLocal(
  unit: Unit,
  voice: VoiceRuntime,
  path: string,
  ffmpeg: string,
  onPid: (pid: number | undefined) => void
) {
  const wav = `${path}.wav`,
    request = `${path}.request.json`
  try {
    if (voice.provider === 'piper') {
      // The legacy C++ CLI opens some files through narrow-character APIs. All managed
      // paths share a data root: relative ASCII paths also work for Unicode user names.
      const cwd = dirname(voice.executable)
      await command(
        voice.executable,
        [
          '--model',
          relative(cwd, voice.model),
          '--config',
          relative(cwd, voice.config),
          '--espeak_data',
          'espeak-ng-data',
          '--output_file',
          relative(cwd, wav),
          '--speaker',
          String(voice.speaker),
          '--length_scale',
          String(1 / unit.settings.speed)
        ],
        { cwd, input: unit.text + '\n', onPid }
      )
    } else {
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escapeXml(voice.locale)}"><prosody rate="${Math.round(unit.settings.speed * 100)}%">${escapeXml(unit.text)}</prosody></speak>`
      await writeFile(
        request,
        JSON.stringify({ operation: 'speak', name: voice.name, output: wav, ssml }),
        'utf8'
      )
      await command(
        voice.powershell,
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          voice.script,
          '-RequestFile',
          request
        ],
        { onPid }
      )
    }
    const pitch = 2 ** (unit.settings.pitch / 120)
    const filter = [
      `aresample=24000`,
      ...(unit.settings.pitch
        ? [`asetrate=${Math.round(24000 * pitch)}`, 'aresample=24000', `atempo=${1 / pitch}`]
        : []),
      `volume=${unit.settings.volume}`
    ].join(',')
    await command(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        wav,
        '-af',
        filter,
        '-ar',
        '24000',
        '-ac',
        '1',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '96k',
        '-f',
        'mp3',
        `${path}.part`
      ],
      { onPid }
    )
    await rename(`${path}.part`, path)
  } finally {
    await Promise.all([rm(wav, { force: true }), rm(request, { force: true })])
  }
}
