import { useEffect, useRef, useState } from 'react'
import {
  Upload,
  Mic2,
  Square,
  Download,
  ArrowUpRight,
  LoaderCircle,
  X,
  CloudOff
} from 'lucide-react'
import type { DesktopApi } from '../../shared/types'
import type { ModuleState, TaskProgress, Transcript } from '../../shared/studio'

type Props = {
  modules: ModuleState[]
  task: TaskProgress | null
  api: () => DesktopApi
  toPreferences: () => void
  useText: (transcript: Transcript) => void
  notify: (text: string) => void
  error: (error: unknown) => void
  stopPlayback: () => void
  result: Transcript | null
  setResult: (value: Transcript) => void
  history: Transcript[]
  recordingChanged: (value: boolean) => void
}
export default function TranscriptionPage({
  modules,
  task,
  api,
  toPreferences,
  useText,
  notify,
  error,
  stopPlayback,
  result,
  setResult,
  history,
  recordingChanged
}: Props) {
  const [language, setLanguage] = useState('es'),
    [pending, setPending] = useState(false)
  const [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0)
  const [format, setFormat] = useState<'txt' | 'docx' | 'srt' | 'vtt'>('txt')
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    discard = useRef(false),
    mounted = useRef(true)
  const installed = modules.some((module) => module.kind === 'transcription' && module.installed)
  const busy = pending || task?.status === 'running'
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      recordingChanged(false)
      if (recorder.current?.state === 'recording') recorder.current.stop()
      stream.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])
  useEffect(() => {
    if (!recording) return
    const timer = setInterval(
      () =>
        setSeconds((value) => {
          if (value >= 899) recorder.current?.stop()
          return value + 1
        }),
      1000
    )
    return () => clearInterval(timer)
  }, [recording])
  useEffect(() => {
    if (!recording) return
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = 'Dictado en curso'
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [recording])
  async function importAudio() {
    try {
      setPending(true)
      const transcript = await api().transcribeFile(language)
      if (transcript) setResult(transcript)
    } catch (reason) {
      error(reason)
    } finally {
      if (mounted.current) setPending(false)
    }
  }
  async function record() {
    try {
      stopPlayback()
      discard.current = false
      await api().requestMicrophone()
      const input = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      if (!mounted.current) {
        input.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = input
      const media = new MediaRecorder(input, { mimeType: 'audio/webm;codecs=opus' }),
        chunks: BlobPart[] = []
      let size = 0
      recorder.current = media
      media.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data)
          size += event.data.size
          if (size > 95 * 1024 * 1024 && media.state === 'recording') media.stop()
        }
      }
      media.onstop = async () => {
        input.getTracks().forEach((track) => track.stop())
        recorder.current = null
        if (mounted.current) setRecording(false)
        recordingChanged(false)
        if (discard.current) return
        if (mounted.current) setPending(true)
        try {
          const bytes = new Uint8Array(await new Blob(chunks, { type: 'audio/webm' }).arrayBuffer())
          const transcript = await api().transcribeRecording(bytes, language)
          setResult({ ...transcript, title: 'Mi dictado' })
        } catch (reason) {
          error(reason)
        } finally {
          if (mounted.current) setPending(false)
        }
      }
      media.onerror = () => {
        discard.current = true
        input.getTracks().forEach((track) => track.stop())
        setRecording(false)
        recordingChanged(false)
        error(
          new Error('La grabación se interrumpió. Comprueba el micrófono y vuelve a intentarlo.')
        )
      }
      media.start(1000)
      setSeconds(0)
      setRecording(true)
      recordingChanged(true)
    } catch (reason) {
      stream.current?.getTracks().forEach((track) => track.stop())
      error(reason)
    }
  }
  function edit(index: number, text: string) {
    if (!result) return
    const segments = result.segments.map((segment, i) =>
      i === index ? { ...segment, text } : segment
    )
    setResult({ ...result, segments, text: segments.map((segment) => segment.text).join('\n') })
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">DE LO QUE ESCUCHAS A LO QUE ESCRIBES</span>
        <h1>Voz a texto.</h1>
        <p>
          Importa un audio, extrae el diálogo de un video o graba tus ideas. La transcripción se
          procesa en tu equipo.
        </p>
      </div>
      {!installed ? (
        <section className="feature-card transcription-intro">
          <CloudOff size={35} />
          <h2>Activa la transcripción local</h2>
          <p>
            Descarga el módulo Whisper Base multilingüe una sola vez (157 MB). Después podrás
            transcribir sin conexión ni una API de pago. Los nombres de personajes pueden necesitar
            correcciones.
          </p>
          <button className="primary-button" onClick={toPreferences}>
            <Download size={16} />
            Ir a módulos opcionales
          </button>
        </section>
      ) : (
        <>
          <section className="feature-card">
            {history.length > 0 && (
              <label className="transcript-history">
                Transcripciones guardadas
                <select
                  aria-label="Abrir transcripción guardada"
                  value={result?.id ?? ''}
                  onChange={(event) => {
                    const item = history.find((entry) => entry.id === event.target.value)
                    if (item) setResult(item)
                  }}
                >
                  <option value="">Elegir transcripción…</option>
                  {history.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="transcription-controls">
              <label>
                Idioma del audio
                <select
                  aria-label="Idioma de transcripción"
                  value={language}
                  disabled={busy || recording}
                  onChange={(event) => setLanguage(event.target.value)}
                >
                  <option value="es">Español</option>
                  <option value="auto">Detectar automáticamente</option>
                  <option value="en">Inglés</option>
                  <option value="pt">Portugués</option>
                  <option value="fr">Francés</option>
                  <option value="it">Italiano</option>
                  <option value="de">Alemán</option>
                  <option value="ja">Japonés</option>
                </select>
              </label>
              <button className="primary-button" disabled={busy || recording} onClick={importAudio}>
                <Upload size={15} />
                Importar audio o video
              </button>
              {recording ? (
                <>
                  <button
                    className="secondary-button recording-stop"
                    onClick={() => recorder.current?.stop()}
                  >
                    <Square size={14} />
                    Terminar · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      discard.current = true
                      recorder.current?.stop()
                    }}
                  >
                    <X size={13} />
                    Descartar
                  </button>
                </>
              ) : (
                <button className="secondary-button" disabled={busy} onClick={record}>
                  <Mic2 size={15} />
                  Grabar dictado
                </button>
              )}
            </div>
            <p className="feature-note">
              MP3, WAV, M4A, FLAC, OGG, MP4, WebM y MKV. Los dictados se transcriben al terminar la
              grabación; hasta 15 minutos por dictado. Para audios más largos, importa el archivo.
            </p>
          </section>
          {busy && (
            <section className="feature-card task-progress">
              <div>
                <LoaderCircle size={17} className="spin" />
                <b>{task?.status === 'running' ? task.phase : 'Preparando transcripción…'}</b>
                <button className="text-button" onClick={() => api().cancelTask().catch(error)}>
                  Cancelar
                </button>
              </div>
              <progress max="1" value={task?.status === 'running' ? task.progress : 0} />
              <p>
                La duración depende del equipo y de la longitud del audio. Puedes seguir trabajando
                en otras pantallas.
              </p>
            </section>
          )}
          {result && (
            <section className="feature-card transcript-result">
              <div className="transcript-heading">
                <div>
                  <h2>Revisa tu transcripción</h2>
                  <p>
                    Corrige los fragmentos antes de exportar o enviarlos al estudio. Los tiempos
                    originales se mantienen.
                  </p>
                </div>
                <button className="secondary-button" onClick={() => useText(result)}>
                  Llevar al estudio
                  <ArrowUpRight size={14} />
                </button>
              </div>
              <label className="transcript-name">
                Título
                <input
                  aria-label="Título de la transcripción"
                  maxLength={160}
                  value={result.title}
                  onChange={(event) => setResult({ ...result, title: event.target.value })}
                />
              </label>
              <div className="transcript-segments">
                {result.segments.map((segment, index) => (
                  <label key={index}>
                    <span>
                      {Math.floor(segment.start / 60)}:
                      {String(Math.floor(segment.start % 60)).padStart(2, '0')}
                    </span>
                    <textarea
                      aria-label={`Transcripción del fragmento ${index + 1}`}
                      value={segment.text}
                      onChange={(event) => edit(index, event.target.value)}
                    />
                  </label>
                ))}
              </div>
              <div className="button-row transcript-export">
                <select
                  aria-label="Formato de transcripción"
                  value={format}
                  onChange={(event) => setFormat(event.target.value as typeof format)}
                >
                  <option value="txt">Texto · TXT</option>
                  <option value="docx">Word · DOCX</option>
                  <option value="srt">Subtítulos · SRT</option>
                  <option value="vtt">Subtítulos · WebVTT</option>
                </select>
                <button
                  className="primary-button"
                  disabled={!result.title.trim()}
                  onClick={async () => {
                    try {
                      const path = await api().exportTranscript(result, format)
                      if (path) notify(`Transcripción guardada en ${path}`)
                    } catch (reason) {
                      error(reason)
                    }
                  }}
                >
                  <Download size={15} />
                  Exportar transcripción
                </button>
              </div>
              <p className="feature-note">
                Los cambios se guardan en tu equipo. Puedes volver a abrir esta transcripción desde
                la lista de arriba.
              </p>
            </section>
          )}
        </>
      )}
    </>
  )
}
