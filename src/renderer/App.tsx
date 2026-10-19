import { APP_VERSION } from '../shared/version'
import {
  t,
  getLanguage,
  setLanguage,
  subscribeLanguage,
  localizeMessage,
  formatNumber
} from '../shared/i18n'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type CSSProperties
} from 'react'
import {
  AudioLines,
  BookOpen,
  LibraryBig,
  Mic2,
  Plus,
  ArrowUpRight,
  Upload,
  Play,
  Pause,
  Download,
  Search,
  X,
  Check,
  ChevronRight,
  FileText,
  LoaderCircle,
  RotateCcw,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
  Headphones,
  Clock3,
  Cloud,
  Settings2,
  Sparkles
} from 'lucide-react'
import {
  DEFAULT_SETTINGS,
  VOICES,
  type Draft,
  type JobSummary,
  type VoiceSettings
} from '../shared/types'

import { Bookmark, WandSparkles, MessageSquareText } from 'lucide-react'
import {
  DEFAULT_PREFERENCES,
  chaptersOf,
  type Preferences,
  type ModuleState,
  type TaskProgress,
  type Transcript
} from '../shared/studio'
import LegalDialog from './components/LegalDialog'
import PreferencesPage from './components/PreferencesPage'
import VoicesPage from './components/VoicesPage'
import PdfImportDialog from './components/PdfImportDialog'
import { voiceInfo, localizeVoice } from '../shared/voice-catalogue'
import type { VoiceInfo, ImportResult } from '../shared/types'
import LibraryPage from './components/LibraryPage'
import VoiceArt from './components/VoiceArt'
import { EMPTY_LIBRARY, type LibraryState } from '../shared/library'
import { appearanceVariables } from '../shared/appearance'
import StoryTools from './components/StoryTools'
import TranscriptionPage from './components/TranscriptionPage'
import { useReadingState } from './hooks/useReadingState'
import { useDialogFocus } from './hooks/useDialogFocus'

type Page = 'studio' | 'library' | 'voices' | 'preferences' | 'transcribe'
const sample = () =>
  t(
    'Aquella noche, el joven abrió los ojos y descubrió un mundo diferente. Su hermano lo esperaba junto a la puerta. No sabía qué les deparaba el destino, pero estaba decidido a proteger a su familia.'
  )
const initialDraft = (): Draft => ({
  title: t('Mi nueva historia'),
  text: '',
  settings: { ...DEFAULT_SETTINGS }
})
const stateLabels = () => ({
  generating: t('Narrando'),
  merging: t('Preparando MP3'),
  completed: t('Lista para escuchar'),
  cancelled: t('Cancelada'),
  failed: t('No se pudo completar'),
  interrupted: t('Lista para reanudar')
})
const number = { format: formatNumber }
function time(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00'
  const value = Math.floor(seconds),
    hours = Math.floor(value / 3600)
  return `${hours ? `${hours}:` : ''}${hours ? String(Math.floor(value / 60) % 60).padStart(2, '0') : Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}
function IconButton({
  label,
  children,
  ...props
}: { label: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  )
}
export default function App() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage)
  useEffect(() => {
    document.documentElement.lang = language
    document.title = t('Fábula — Estudio de narración')
  }, [language])

  const [page, setPage] = useState<Page>('studio')
  const [catalogue, setCatalogue] = useState<VoiceInfo[]>(VOICES)
  const [pdfPreview, setPdfPreview] = useState<ImportResult | null>(null)
  const [lastPdf, setLastPdf] = useState<ImportResult | null>(null)
  const [collections, setCollections] = useState<LibraryState>(structuredClone(EMPTY_LIBRARY))
  const [projectFilter, setProjectFilter] = useState('all')
  const [preferences, setPreferences] = useState<Preferences>(structuredClone(DEFAULT_PREFERENCES))
  const [modules, setModules] = useState<ModuleState[]>([])
  const [task, setTask] = useState<TaskProgress | null>(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [readingOpen, setReadingOpen] = useState(false)
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const metadataReady = useRef(false)
  const microphoneActive = useRef(false)
  const [draft, setDraft] = useState<Draft>(initialDraft)
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [starting, setStarting] = useState(false)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState('')
  const [modal, setModal] = useState(false)
  const [legalOpen, setLegalOpen] = useState(false)
  const aboutRef = useRef<HTMLElement>(null)
  useDialogFocus(aboutRef, () => setModal(false), modal)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)
  const [playerVolume, setPlayerVolume] = useState(0.8)
  const [playbackRate, setPlaybackRate] = useState(1)
  const audio = useRef<HTMLAudioElement>(null)
  const autoPlay = useRef(false)
  const startedIds = useRef(new Set<string>())
  const saveVersion = useRef(0)
  const localizedCatalogue = catalogue.map(localizeVoice)
  const selectedVoice = voiceInfo(draft.settings.voice, localizedCatalogue)
  const draftProfile = preferences.profiles.find(
    (profile) =>
      profile.settings.voice === draft.settings.voice &&
      profile.settings.speed === draft.settings.speed &&
      profile.settings.pitch === draft.settings.pitch &&
      profile.settings.volume === draft.settings.volume &&
      profile.pauseMs === (draft.pauseMs ?? 350)
  )
  const current = jobs.find((job) => job.id === currentId)
  const currentVoice = current ? voiceInfo(current.settings.voice, localizedCatalogue) : undefined
  const active = jobs.find((job) => job.status === 'generating' || job.status === 'merging')
  const library = jobs.filter((job) => !job.preview)
  const words = useMemo(
    () => (draft.text.trim() ? draft.text.trim().split(/\s+/u).length : 0),
    [draft.text]
  )
  const chapterCount = useMemo(() => chaptersOf(draft.text).length, [draft.text])
  const minutes = Math.max(1, Math.ceil(words / (150 * draft.settings.speed)))
  const busy = !!active || starting
  const source =
    current?.status === 'completed' ? `fabula-audio://narration/${current.id}` : undefined

  const notifyError = (error: unknown) =>
    setToast(
      error instanceof Error
        ? localizeMessage(
            error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
          )
        : String(error)
    )
  const reading = useReadingState(notifyError)
  const preferenceVersion = useRef(0)
  function updatePreferences(value: Preferences) {
    const previous = preferences
    const version = ++preferenceVersion.current
    setPreferences(value)
    setLanguage(value.language)
    window.fabula?.savePreferences(value).catch((error) => {
      if (version === preferenceVersion.current) {
        setPreferences(previous)
        setLanguage(previous.language)
      }
      notifyError(error)
    })
  }
  async function saveProfiles(profiles: Preferences['profiles']) {
    const value = { ...preferences, profiles }
    await api().savePreferences(value)
    setPreferences(value)
  }
  function applyProfile(profile: Preferences['profiles'][number]) {
    setDraft((previous) => ({
      ...previous,
      settings: { ...profile.settings },
      pauseMs: profile.pauseMs
    }))
    setPage('studio')
    setToast(t('Perfil «{0}» listo para la próxima narración.', profile.name))
  }
  function updateTranscript(value: Transcript) {
    const next = { ...value, title: value.title.trim() || t('Mi transcripción') }
    setTranscript(value)
    setTranscripts((previous) => [next, ...previous.filter((item) => item.id !== value.id)])
    window.fabula?.saveTranscript(next).catch(notifyError)
  }
  function api() {
    if (!window.fabula)
      throw new Error(
        t(
          'Esta es la vista del diseño. Abre la aplicación de escritorio Fábula para narrar e importar documentos.'
        )
      )
    return window.fabula
  }
  function upsert(job: JobSummary) {
    setJobs((previous) =>
      [job, ...previous.filter((item) => item.id !== job.id)].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      )
    )
  }
  function settings(change: Partial<VoiceSettings>) {
    setDraft((previous) => ({ ...previous, settings: { ...previous.settings, ...change } }))
  }

  useEffect(() => {
    if (!window.fabula) {
      setLoaded(true)
      return
    }
    let cancelled = false
    const off = window.fabula.onJob((job) => {
      upsert(job)
      if (job.status === 'completed' && startedIds.current.delete(job.id)) {
        autoPlay.current = !microphoneActive.current
        setCurrentId(job.id)
        setToast(
          job.preview
            ? t('Tu muestra está lista.')
            : t('Tu historia ya tiene voz. Dale al play y disfrútala.')
        )
      }
      if (job.status === 'failed') {
        startedIds.current.delete(job.id)
        setToast(job.error || t('No se pudo generar el audio.'))
      }
    })
    const offModules = window.fabula.onModule((value) =>
      setModules((previous) => [...previous.filter((item) => item.kind !== value.kind), value])
    )
    const offTask = window.fabula.onTask(setTask)
    const offVoices = window.fabula.onVoices(setCatalogue)
    const offLibrary = window.fabula.onLibrary((value) => {
      setCollections(value)
      setDraft((previous) =>
        previous.projectId && !value.projects.some((project) => project.id === previous.projectId)
          ? { ...previous, projectId: null }
          : previous
      )
      setProjectFilter((previous) =>
        ['all', 'unassigned'].includes(previous) ||
        value.projects.some((project) => project.id === previous)
          ? previous
          : 'all'
      )
    })
    const offRemoved = window.fabula.onJobRemoved((id) => {
      setJobs((previous) => previous.filter((job) => job.id !== id))
      startedIds.current.delete(id)
      if (audio.current?.getAttribute('src')?.endsWith(id)) {
        audio.current?.pause()
        audio.current?.removeAttribute('src')
        audio.current?.load()
        autoPlay.current = false
        setReadingOpen(false)
      }
      setCurrentId((previous) => (previous === id ? null : previous))
      reading.forget(id)
    })
    window.fabula
      .boot()
      .then((state) => {
        if (cancelled) return
        setDraft(state.draft)
        setJobs(state.jobs)
        setLanguage(state.preferences.language)
        setPreferences(state.preferences)
        setModules(state.modules)
        setCollections(state.library)
        setCatalogue(state.voices)
        reading.initialize(state.playback)
        setTranscripts(state.transcripts)
        setTranscript(state.transcripts[0] ?? null)
        setCurrentId(
          state.jobs.find(
            (job) => job.id === state.playback.currentId && job.status === 'completed'
          )?.id ??
            state.jobs.find((job) => job.status === 'completed' && !job.preview)?.id ??
            null
        )
        if (state.warnings.length) setToast(state.warnings.join(' '))
        setLoaded(true)
      })
      .catch((error) => {
        if (!cancelled) {
          notifyError(error)
          setLoaded(true)
        }
      })
    return () => {
      cancelled = true
      off()
      offModules()
      offTask()
      offLibrary()
      offRemoved()
      offVoices()
    }
  }, [])

  useEffect(() => {
    if (!loaded || !window.fabula) return
    const version = ++saveVersion.current
    setSaving(true)
    window
      .fabula!.saveDraft({ ...draft, title: draft.title.trim() || t('Sin título') })
      .then(() => {
        if (saveVersion.current === version) setSaving(false)
      })
      .catch(notifyError)
  }, [draft, loaded])
  useEffect(() => {
    if (audio.current) audio.current.volume = playerVolume
  }, [playerVolume])
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = playbackRate
  }, [playbackRate, currentId])
  useEffect(() => {
    setPosition(0)
    setDuration(0)
    metadataReady.current = false
    if (loaded) reading.select(currentId)
  }, [currentId, loaded])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && readingOpen) setReadingOpen(false)
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key === 'Enter' && !busy && draft.text.trim()) {
        event.preventDefault()
        start()
      }
      if (event.key.toLowerCase() === 'o' && !importing) {
        event.preventDefault()
        importDocument()
      }
      if (event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        newStory()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 10000)
    return () => clearTimeout(timer)
  }, [toast])

  async function start(preview = false, voiceId = draft.settings.voice, snapshot = draft) {
    try {
      setStarting(true)
      const text = preview ? snapshot.text.trim().slice(0, 350) || sample() : snapshot.text
      const job = await api().start({
        ...snapshot,
        title: preview
          ? t('Muestra de {0}', voiceInfo(voiceId, catalogue).name)
          : snapshot.title.trim() || t('Sin título'),
        text,
        settings: { ...snapshot.settings, voice: voiceId },
        blockOverrides: preview ? {} : snapshot.blockOverrides,
        preview
      })
      startedIds.current.add(job.id)
      upsert(job)
    } catch (error) {
      notifyError(error)
    } finally {
      setStarting(false)
    }
  }
  async function importDocument(ocr = false) {
    try {
      if (
        draft.text.trim() &&
        !(await api().confirm(
          t(
            'Importar reemplazará el texto del editor. Las narraciones de la biblioteca se conservarán. ¿Continuar?'
          )
        ))
      )
        return
      setImporting(true)
      const result = await api().importDocument({ ocr })
      if (result?.pdf) {
        setPdfPreview(result)
        return
      }
      if (result) {
        setLastPdf(null)
        setDraft((previous) => ({
          ...previous,
          title: result.title,
          text: result.text,
          blockOverrides: {}
        }))
        setToast(
          result.pages
            ? t(
                'Importadas {0} páginas. Revisa el orden y los saltos del texto antes de narrar.',
                result.pages
              )
            : t('Texto importado. Ya puedes darle voz.')
        )
        setPage('studio')
      }
    } catch (error) {
      notifyError(error)
    } finally {
      setImporting(false)
    }
  }
  async function exportAudio(id = currentId) {
    if (!id) return
    try {
      const path = await api().exportMp3(id)
      if (path) setToast(t('MP3 guardado en {0}', path))
    } catch (error) {
      notifyError(error)
    }
  }
  function selectAudio(job: JobSummary) {
    if (job.id === currentId) {
      togglePlay()
      return
    }
    autoPlay.current = true
    setCurrentId(job.id)
  }
  function togglePlay() {
    if (!audio.current || !source) return
    if (audio.current.paused) audio.current.play().catch(notifyError)
    else audio.current.pause()
  }
  function seek(value: number) {
    if (audio.current && duration) {
      audio.current.currentTime = Math.max(0, Math.min(duration, value))
      setPosition(audio.current.currentTime)
    }
  }
  async function newStory() {
    if (
      draft.text.trim() &&
      !(await api().confirm(
        t(
          '¿Crear una nueva historia? El texto del editor se reemplazará. Las narraciones generadas seguirán en tu biblioteca.'
        )
      ))
    )
      return
    setLastPdf(null)
    setDraft({
      ...initialDraft(),
      settings: { ...draft.settings },
      projectId: collections.projects.some((project) => project.id === projectFilter)
        ? projectFilter
        : null
    })
    setPage('studio')
  }
  async function resume(job: JobSummary) {
    try {
      startedIds.current.add(job.id)
      await api().resume(job.id)
    } catch (error) {
      startedIds.current.delete(job.id)
      notifyError(error)
    }
  }

  async function deleteNarration(job: JobSummary) {
    const wasPlaying = currentId === job.id && !!audio.current && !audio.current.paused
    if (currentId === job.id) audio.current?.pause()
    try {
      if (await api().deleteJob(job.id)) setToast(t('Narración movida a la Papelera de Windows.'))
      else if (wasPlaying) audio.current?.play().catch(notifyError)
    } catch (error) {
      notifyError(error)
    }
  }
  async function openNarration(job: JobSummary) {
    try {
      if (
        draft.text.trim() &&
        !(await api().confirm(
          t('¿Abrir esta historia en el editor y reemplazar el borrador actual?')
        ))
      )
        return
      setDraft(await api().openJob(job.id))
      setPage('studio')
    } catch (error) {
      notifyError(error)
    }
  }

  if (!loaded)
    return (
      <div className="app-loading" aria-busy="true">
        Fábula
      </div>
    )

  return (
    <div
      className="app-shell"
      data-custom-colors={preferences.customColors.enabled}
      data-theme={preferences.theme}
      data-accent={preferences.accent}
      data-editor-width={preferences.editorWidth}
      style={
        {
          '--editor-font-size': `${preferences.editorFontSize}px`,
          ...appearanceVariables(preferences.customColors)
        } as CSSProperties
      }
    >
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault()
            setPage('studio')
          }}
          aria-label={t('Fábula, inicio')}
        >
          <span className="brand-symbol">
            <AudioLines size={25} />
          </span>
          fábula<span className="brand-dot">.</span>
        </a>
        <div className="sidebar-caption">{t('TU ESPACIO CREATIVO')}</div>
        <nav aria-label={t('Navegación principal')}>
          <button
            className={page === 'studio' ? 'nav-item active' : 'nav-item'}
            onClick={() => setPage('studio')}
          >
            <AudioLines size={19} />
            {t('Estudio de narración')}
            <span className="nav-dot" />
          </button>
          <button
            className={page === 'library' ? 'nav-item active' : 'nav-item'}
            onClick={() => setPage('library')}
          >
            <LibraryBig size={19} />
            {t('Tu biblioteca')}
            <span className="nav-count">{library.length}</span>
          </button>
          <button
            className={page === 'voices' ? 'nav-item active' : 'nav-item'}
            onClick={() => setPage('voices')}
          >
            <Mic2 size={19} />
            {t('Explorar voces')}
          </button>
          <button
            className={page === 'transcribe' ? 'nav-item active' : 'nav-item'}
            onClick={() => setPage('transcribe')}
          >
            <MessageSquareText size={19} />
            {t('Voz a texto')}
          </button>
          <button
            className={page === 'preferences' ? 'nav-item active' : 'nav-item'}
            onClick={() => setPage('preferences')}
          >
            <Settings2 size={19} />
            {t('Preferencias')}
          </button>
        </nav>
        <div className="side-divider" />
        <div className="sidebar-row">
          <span className="sidebar-caption">{t('TUS NARRACIONES')}</span>
          <IconButton label={t('Nueva historia')} onClick={newStory}>
            <Plus size={16} />
          </IconButton>
        </div>
        <div className="recent-list">
          {library.slice(0, 4).map((job) => (
            <button
              className="recent-item"
              key={job.id}
              onClick={() => {
                if (job.status === 'completed') selectAudio(job)
                setPage('library')
              }}
            >
              <span className={`recent-cover ${voiceInfo(job.settings.voice, catalogue).color}`}>
                <BookOpen size={15} />
              </span>
              <span>
                <b>{job.title}</b>
                <small>{stateLabels()[job.status]}</small>
              </span>
            </button>
          ))}
          {!library.length && (
            <div className="side-empty">
              <BookOpen size={24} />
              <p>
                {t('Una buena historia')}
                <br />
                {t('merece ser escuchada.')}
              </p>
              <span>{t('Las tuyas aparecerán aquí.')}</span>
            </div>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="live-dot" />
            <span>{t('Tu biblioteca, en tu equipo')}</span>
          </div>
          <button className="nav-item" onClick={() => setModal(true)}>
            <Settings2 size={18} />
            {t('Acerca de Fábula')}
          </button>
          <div className="profile">
            <span className="profile-avatar">T</span>
            <div>
              <b>{t('Tu espacio personal')}</b>
              <small>{t('Hecho para contar historias')}</small>
            </div>
            <Headphones size={17} />
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            {t('Tu espacio')} <ChevronRight size={14} />
            <strong>
              {page === 'studio'
                ? t('Estudio de narración')
                : page === 'library'
                  ? t('Tu biblioteca')
                  : page === 'preferences'
                    ? t('Preferencias')
                    : page === 'transcribe'
                      ? t('Voz a texto')
                      : t('Explorar voces')}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="cloud-badge">
              <Cloud size={14} />
              {t('Voces sin suscripción')}
            </span>
            <button className="small-new" onClick={newStory}>
              <Plus size={15} />
              {t('Nueva historia')}
            </button>
          </div>
        </header>
        {task?.status === 'running' && page !== 'transcribe' && (
          <div className="global-task" role="status">
            <LoaderCircle size={14} className="spin" />
            <span>{localizeMessage(task.phase)}</span>
            <progress max="1" value={task.progress} />
            <button onClick={() => api().cancelTask().catch(notifyError)}>{t('Cancelar')}</button>
          </div>
        )}
        <main className={`main-content ${page === 'studio' ? 'studio-main' : ''}`}>
          {page === 'preferences' && (
            <PreferencesPage
              voices={localizedCatalogue}
              busy={busy}
              saveProfiles={saveProfiles}
              applyProfile={applyProfile}
              previewProfile={(profile) =>
                start(true, profile.settings.voice, {
                  ...draft,
                  text: sample(),
                  settings: { ...profile.settings },
                  pauseMs: profile.pauseMs
                })
              }
              preferences={preferences}
              update={updatePreferences}
              draft={draft}
              setDraft={setDraft}
              modules={modules}
              api={api}
              notify={setToast}
              error={notifyError}
            />
          )}
          {page === 'transcribe' && (
            <TranscriptionPage
              modules={modules}
              task={task}
              api={api}
              toPreferences={() => setPage('preferences')}
              result={transcript}
              setResult={updateTranscript}
              history={transcripts}
              stopPlayback={() => audio.current?.pause()}
              recordingChanged={(value) => {
                microphoneActive.current = value
              }}
              notify={setToast}
              error={notifyError}
              useText={async (value) => {
                if (
                  draft.text.trim() &&
                  !(await api().confirm(t('¿Reemplazar el borrador por esta transcripción?')))
                )
                  return
                setDraft({ ...draft, title: value.title, text: value.text, blockOverrides: {} })
                setPage('studio')
              }}
            />
          )}
          {page === 'studio' && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <div className="eyebrow">
                    <span />
                    {t('UN NUEVO CAPÍTULO EMPIEZA AQUÍ')}
                  </div>
                  <h1>
                    {t('Tus historias.')}
                    <br />
                    <em>{t('Ahora, con voz.')}</em>
                  </h1>
                  <p>{t('Deja que tus palabras se conviertan en algo que puedas escuchar.')}</p>
                  <div className="hero-tags">
                    <span>
                      <FileText size={13} />
                      {t('Texto o PDF')}
                    </span>
                    <span>
                      <Mic2 size={13} />
                      {t('Voces en español')}
                    </span>
                    <span>
                      <Download size={13} />
                      {t('Exporta a MP3')}
                    </span>
                  </div>
                </div>
                <div className="hero-illustration" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="floating-tile">
                    <AudioLines size={65} strokeWidth={1.4} />
                    <span>
                      {t('CADA HISTORIA')}
                      <br />
                      {t('TIENE SU VOZ')}
                    </span>
                    <div className="tile-lines">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                  <span className="floating-spark">✦</span>
                  <span className="art-label">{t('DALE PLAY A TU IMAGINACIÓN')}</span>
                </div>
              </section>
              <div className="section-heading">
                <div>
                  <span className="step-number">01</span>
                  <h2>{t('Prepara tu narración')}</h2>
                </div>
                <span className="autosave">
                  <Check size={12} />
                  {!window.fabula
                    ? t('Vista del diseño')
                    : saving
                      ? t('Guardando borrador…')
                      : t('Borrador guardado')}
                </span>
              </div>
              <div className="draft-project-row">
                <label>
                  <LibraryBig size={14} />
                  {t('Proyecto')}
                  <select
                    aria-label={t('Proyecto de la nueva narración')}
                    value={draft.projectId ?? ''}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        projectId: event.target.value || null
                      }))
                    }
                  >
                    <option value="">{t('Sin proyecto')}</option>
                    {collections.projects.map((project) => (
                      <option value={project.id} key={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="text-button" onClick={() => setPage('library')}>
                  {t('Gestionar proyectos')}
                  <ChevronRight size={13} />
                </button>
              </div>
              <div className="studio-tool-row">
                {lastPdf && (
                  <button className="secondary-button" onClick={() => setPdfPreview(lastPdf)}>
                    {t('Ajustar encabezados y pies del PDF')}
                  </button>
                )}
                <span>
                  <BookOpen size={13} />
                  {chapterCount} {t('capítulos detectados')}
                </span>
                <button className="secondary-button" onClick={() => setToolsOpen(true)}>
                  <WandSparkles size={14} />
                  {t('Capítulos, personajes y limpieza')}
                </button>
              </div>
              <div className="studio-grid">
                <section className="editor-panel panel">
                  <div className="panel-toolbar">
                    <div className="panel-label">
                      <FileText size={17} />
                      {t('Tu historia')}
                    </div>
                    <button
                      className="import-button"
                      onClick={() => importDocument()}
                      disabled={importing}
                    >
                      {importing ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : (
                        <Upload size={14} />
                      )}
                      {importing ? t('Leyendo documento…') : t('Importar archivo')}
                      <span>{t('PDF, EPUB, WORD')}</span>
                    </button>
                    <button
                      className="ocr-import-button"
                      disabled={importing}
                      onClick={() => importDocument(true)}
                      title={t('Importar imágenes o PDF escaneado con OCR')}
                    >
                      OCR
                    </button>
                  </div>
                  <div className="document-body">
                    <input
                      className="title-input"
                      aria-label={t('Título de la historia')}
                      maxLength={160}
                      value={draft.title}
                      onChange={(event) =>
                        setDraft((previous) => ({ ...previous, title: event.target.value }))
                      }
                    />
                    <div className="document-rule" />
                    <textarea
                      aria-label={t('Texto para narrar')}
                      placeholder={t(
                        'Toda gran historia comienza con unas palabras…\n\nPega tu texto aquí o importa un documento. Nosotros nos encargamos de darle voz.'
                      )}
                      value={draft.text}
                      spellCheck
                      onChange={(event) =>
                        setDraft((previous) => ({ ...previous, text: event.target.value }))
                      }
                    />
                    <div className="document-footer">
                      <span>
                        {number.format(draft.text.length)} {t('caracteres')}
                        <span className="counter-dot">·</span>
                        {number.format(words)} {t('palabras')}
                      </span>
                      <span>
                        <Clock3 size={12} />
                        {words ? t('~{0} min de audio', minutes) : t('Tu próxima historia')}
                      </span>
                    </div>
                  </div>
                  <div className="editor-note">
                    <BookOpen size={14} />
                    <span>
                      {t('De un párrafo a una novela. Tu historia se procesa por partes.')}
                    </span>
                  </div>
                </section>
                <aside className="voice-panel panel">
                  <div className="panel-toolbar">
                    <div className="panel-label">
                      <Settings2 size={16} />
                      {t('Dale tu estilo')}
                    </div>
                    <span className="mini-label">{t('VOZ Y RITMO')}</span>
                  </div>
                  <div className="voice-panel-body">
                    <label className="field-label" htmlFor="voice-select">
                      {t('VOZ NARRADORA')}
                    </label>
                    <div className="selected-voice">
                      <VoiceArt voice={selectedVoice} small />
                      <div>
                        <b>{selectedVoice.name}</b>
                        <span>
                          {t('Español ·')} {selectedVoice.country}
                        </span>
                      </div>
                      <span className="selected-check">
                        <Check size={13} />
                      </span>
                    </div>
                    <select
                      id="voice-select"
                      aria-label={t('Elegir voz')}
                      value={draft.settings.voice}
                      onChange={(event) =>
                        settings({ voice: event.target.value as VoiceSettings['voice'] })
                      }
                    >
                      {localizedCatalogue.map((voice) => (
                        <option value={voice.id} key={voice.id}>
                          {voice.name} · {voice.country}
                        </option>
                      ))}
                    </select>
                    <label className="pause-control profile-select-label">
                      {t('Perfil de voz')}
                      <select
                        className="profile-select"
                        aria-label={t('Aplicar perfil guardado')}
                        value={draftProfile?.id ?? ''}
                        onChange={(event) => {
                          const profile = preferences.profiles.find(
                            (item) => item.id === event.target.value
                          )
                          if (profile) applyProfile(profile)
                        }}
                      >
                        <option value="">{t('Ajustes personalizados')}</option>
                        {preferences.profiles.map((profile) => (
                          <option
                            key={profile.id}
                            value={profile.id}
                            disabled={
                              !catalogue.some((voice) => voice.id === profile.settings.voice)
                            }
                          >
                            {profile.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="text-button" onClick={() => setPage('preferences')}>
                      {t('Crear o editar perfiles')}
                    </button>
                    <button className="sample-button" onClick={() => start(true)} disabled={busy}>
                      <Play size={13} fill="currentColor" />
                      {t('Escuchar una muestra')}
                      <span>~15 s</span>
                    </button>
                    <div className="controls-divider" />
                    <div className="slider-heading">
                      <label htmlFor="speed">{t('Velocidad de lectura')}</label>
                      <strong>
                        {formatNumber(draft.settings.speed, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 2
                        })}
                        ×
                      </strong>
                    </div>
                    <input
                      className="range mint-range"
                      id="speed"
                      type="range"
                      min="0.5"
                      max="1.75"
                      step="0.05"
                      value={draft.settings.speed}
                      onChange={(event) => settings({ speed: Number(event.target.value) })}
                    />
                    <div className="range-labels">
                      <span>{t('Más pausada')}</span>
                      <span>{t('Más ágil')}</span>
                    </div>
                    <div className="slider-heading tone-heading">
                      <label htmlFor="pitch">{t('Tono de voz')}</label>
                      <strong>
                        {draft.settings.pitch > 0 ? '+' : ''}
                        {draft.settings.pitch} Hz
                      </strong>
                    </div>
                    <input
                      className="range"
                      id="pitch"
                      type="range"
                      min="-30"
                      max="30"
                      step="1"
                      value={draft.settings.pitch}
                      onChange={(event) => settings({ pitch: Number(event.target.value) })}
                    />
                    <div className="range-labels">
                      <span>{t('Más grave')}</span>
                      <span>{t('Más agudo')}</span>
                    </div>
                    <div className="preset-row">
                      <button
                        className={
                          draft.settings.speed === 1 && draft.settings.pitch === 0 ? 'selected' : ''
                        }
                        onClick={() => settings({ speed: 1, pitch: 0 })}
                      >
                        {t('Natural')}
                      </button>
                      <button
                        className={
                          draft.settings.speed === 1.2 && draft.settings.pitch === 0
                            ? 'selected'
                            : ''
                        }
                        onClick={() => settings({ speed: 1.2, pitch: 0 })}
                      >
                        {t('Ágil')}
                      </button>
                      <button
                        className={draft.settings.pitch === -15 ? 'selected' : ''}
                        onClick={() => settings({ speed: 1.05, pitch: -15 })}
                      >
                        {t('Grave')}
                      </button>
                    </div>
                    <label className="pause-control">
                      {t('Pausa entre párrafos')}
                      <select
                        aria-label={t('Pausa general entre párrafos')}
                        value={draft.pauseMs ?? 350}
                        onChange={(event) => setDraft({ ...draft, pauseMs: +event.target.value })}
                      >
                        {![0, 350, 750, 1500].includes(draft.pauseMs ?? 350) && (
                          <option value={draft.pauseMs}>
                            {((draft.pauseMs ?? 350) / 1000).toLocaleString(language)}{' '}
                            {t('s · personalizada')}
                          </option>
                        )}
                        <option value="0">{t('Sin pausa adicional')}</option>
                        <option value="350">{t('Breve · 350 ms')}</option>
                        <option value="750">{t('Media · 750 ms')}</option>
                        <option value="1500">{t('Larga · 1.5 s')}</option>
                      </select>
                    </label>
                    <p className="connection-note">
                      <Cloud size={12} />
                      {selectedVoice.provider === 'edge'
                        ? t('Esta voz neural necesita Internet.')
                        : t(
                            'Esta voz se procesa en tu equipo. El tono local usa un efecto de audio.'
                          )}
                    </p>
                  </div>
                </aside>
              </div>
              {active && (
                <div className="generation-progress" role="status">
                  <div>
                    <LoaderCircle size={17} className="spin" />
                    <span>
                      <b>
                        {active.preview ? t('Preparando tu muestra') : stateLabels()[active.status]}
                      </b>
                      <small>
                        {active.status === 'merging'
                          ? t('Uniendo los fragmentos en un MP3…')
                          : t(
                              '{0} de {1} fragmentos · {2}',
                              active.completedChunks,
                              active.totalChunks,
                              active.title
                            )}
                      </small>
                    </span>
                    <button onClick={() => api().cancel(active.id).catch(notifyError)}>
                      <Square size={12} />
                      {t('Cancelar')}
                    </button>
                  </div>
                  <progress max={active.totalChunks || 1} value={active.completedChunks} />
                </div>
              )}
              <div className="generate-row">
                <div>
                  <span className="tiny-spark">
                    <Sparkles size={18} />
                  </span>
                  <span>
                    <b>{t('El siguiente paso es escuchar.')}</b>
                    <small>{t('Elige tu voz, ajusta el ritmo y dale vida a tu historia.')}</small>
                  </span>
                </div>
                <button
                  className="primary-button"
                  onClick={() => start()}
                  disabled={busy || !draft.text.trim()}
                >
                  {busy ? <LoaderCircle size={17} className="spin" /> : <AudioLines size={18} />}
                  {busy ? t('Creando audio…') : t('Generar narración')}
                  <ArrowUpRight size={17} />
                </button>
              </div>
              <div className="bottom-note">
                <Headphones size={13} />
                {t(
                  'Tu texto se envía al servicio de voz de Microsoft para generar el audio. La biblioteca se guarda en tu equipo.'
                )}
              </div>
            </>
          )}
          {page === 'voices' && (
            <VoicesPage
              voices={localizedCatalogue}
              selected={draft.settings.voice}
              busy={busy}
              choose={(id) => {
                settings({ voice: id })
                setToast(t('{0} es ahora tu voz narradora.', voiceInfo(id, catalogue).name))
              }}
              preview={(id) => start(true, id)}
              api={api}
              modules={modules}
              notify={setToast}
              error={notifyError}
            />
          )}{' '}
          {page === 'library' && (
            <LibraryPage
              voices={localizedCatalogue}
              jobs={library}
              library={collections}
              filter={projectFilter}
              setFilter={setProjectFilter}
              currentId={currentId}
              playing={playing}
              busy={busy}
              api={api}
              play={selectAudio}
              exportAudio={exportAudio}
              open={openNarration}
              resume={resume}
              remove={deleteNarration}
              newStory={newStory}
              error={notifyError}
              notify={setToast}
            />
          )}
        </main>
      </div>

      <footer className="player">
        <div className="now-playing">
          {currentVoice ? (
            <VoiceArt voice={currentVoice} small />
          ) : (
            <div className="player-empty-art">
              <AudioLines size={23} />
            </div>
          )}
          <div>
            <b>{current?.title || t('Tu historia está por sonar')}</b>
            <span>
              {currentVoice
                ? `${currentVoice.name} · ${current?.preview ? t('Muestra de voz') : t('Narración generada')}`
                : t('Crea tu primera narración')}
            </span>
          </div>
          {current && (
            <span className="audio-indicator">
              <AudioLines size={15} />
            </span>
          )}
        </div>
        <div className="playback">
          <div className="transport">
            <IconButton
              label={t('Retroceder 15 segundos')}
              disabled={!source}
              onClick={() => seek(position - 15)}
            >
              <SkipBack size={16} />
            </IconButton>
            <button
              className="play-toggle"
              aria-label={playing ? t('Pausar') : t('Reproducir')}
              disabled={!source}
              onClick={togglePlay}
            >
              {playing ? (
                <Pause size={18} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" />
              )}
            </button>
            <IconButton
              label={t('Adelantar 15 segundos')}
              disabled={!source}
              onClick={() => seek(position + 15)}
            >
              <SkipForward size={16} />
            </IconButton>
          </div>
          <div className="timeline">
            <span>{time(position)}</span>
            <input
              aria-label={t('Posición del audio')}
              type="range"
              min="0"
              max={duration || 1}
              step="0.1"
              value={position}
              disabled={!source || !duration}
              onChange={(event) => seek(Number(event.target.value))}
            />
            <span>{time(duration)}</span>
          </div>
        </div>
        <div className="player-actions">
          <IconButton
            label={t('Capítulos y marcadores')}
            disabled={!source}
            onClick={() => setReadingOpen((previous) => !previous)}
          >
            <Bookmark size={16} />
          </IconButton>
          <select
            className="playback-speed"
            aria-label={t('Velocidad del reproductor')}
            value={playbackRate}
            onChange={(event) => setPlaybackRate(Number(event.target.value))}
          >
            <option value={0.75}>0.75×</option>
            <option value={1}>1×</option>
            <option value={1.25}>1.25×</option>
            <option value={1.5}>1.5×</option>
            <option value={2}>2×</option>
          </select>
          <Volume2 size={16} />
          <input
            aria-label={t('Volumen del reproductor')}
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={playerVolume}
            onChange={(event) => setPlayerVolume(Number(event.target.value))}
          />
          <span className="player-divider" />
          <button className="export-button" onClick={() => exportAudio()} disabled={!source}>
            <Download size={15} />
            <span>{t('Exportar MP3')}</span>
          </button>
        </div>
      </footer>
      <audio
        ref={audio}
        src={source}
        preload="metadata"
        onLoadedMetadata={() => {
          const element = audio.current
          if (!element) return
          setDuration(element.duration || 0)
          if (currentId) {
            const saved = reading.position(currentId)
            if (saved > 0 && saved < element.duration - 1) element.currentTime = saved
          }
          metadataReady.current = true
        }}
        onTimeUpdate={() => {
          const value = audio.current?.currentTime || 0
          setPosition(value)
          if (metadataReady.current) reading.savePosition(currentId, value)
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false)
          if (metadataReady.current)
            reading.savePosition(currentId, audio.current?.currentTime || 0, true)
        }}
        onEnded={() => setPlaying(false)}
        onError={() => {
          if (source)
            setToast(
              t(
                'No se pudo reproducir el archivo. Prueba a exportarlo o a generar la narración nuevamente.'
              )
            )
        }}
        onCanPlay={() => {
          if (autoPlay.current) {
            autoPlay.current = false
            audio.current?.play().catch(notifyError)
          }
        }}
      />
      {pdfPreview?.pdf && (
        <PdfImportDialog
          result={pdfPreview}
          options={preferences.pdfImport}
          close={() => setPdfPreview(null)}
          apply={(text, options) => {
            setLastPdf(pdfPreview)
            setDraft((previous) => ({
              ...previous,
              title: pdfPreview.title,
              text,
              blockOverrides: {}
            }))
            updatePreferences({ ...preferences, pdfImport: options })
            setPdfPreview(null)
            setPage('studio')
            setToast(
              t('PDF importado con los márgenes seleccionados. Revisa el texto antes de narrar.')
            )
          }}
        />
      )}
      {toolsOpen && (
        <StoryTools
          voices={localizedCatalogue}
          draft={draft}
          update={setDraft}
          close={() => setToolsOpen(false)}
          busy={busy}
          onRegenerate={(value) => start(false, value.settings.voice, value)}
        />
      )}
      {readingOpen && current && (
        <section className="reading-panel" aria-label={t('Capítulos y marcadores')}>
          <div className="reading-heading">
            <b>{t('Continúa tu historia')}</b>
            <IconButton label={t('Cerrar marcadores')} onClick={() => setReadingOpen(false)}>
              <X size={16} />
            </IconButton>
          </div>
          <p>{current.title}</p>
          <h3>{t('Capítulos')}</h3>
          {current.chapters?.map((chapter, index) => (
            <button className="chapter-seek" key={index} onClick={() => seek(chapter.startSeconds)}>
              <BookOpen size={13} />
              <span>{chapter.synthetic ? localizeMessage(chapter.title) : chapter.title}</span>
              <small>{time(chapter.startSeconds)}</small>
            </button>
          ))}
          {!current.chapters?.length && (
            <p className="feature-note">
              {t('Esta narración anterior no tiene un índice de capítulos.')}
            </p>
          )}
          {!!current.chapters?.length && (
            <button
              className="secondary-button"
              onClick={async () => {
                try {
                  const folder = await api().exportChapters(current.id)
                  if (folder) setToast(t('Capítulos exportados a {0}', folder))
                } catch (error) {
                  notifyError(error)
                }
              }}
            >
              <Download size={13} />
              {t('Exportar MP3 por capítulos')}
            </button>
          )}
          <h3>{t('Mis marcadores')}</h3>
          <button
            className="secondary-button"
            onClick={() => reading.add(current.id, t('Marcador · {0}', time(position)), position)}
          >
            <Plus size={13} />
            {t('Guardar posición')} {time(position)}
          </button>
          {(reading.bookmarks[current.id] ?? []).map((bookmark) => (
            <div className="bookmark-entry" key={bookmark.id}>
              <button onClick={() => seek(bookmark.seconds)}>
                {localizeMessage(bookmark.label)}
              </button>
              <IconButton
                label={t('Eliminar marcador')}
                onClick={() => reading.remove(current.id, bookmark.id)}
              >
                <X size={13} />
              </IconButton>
            </div>
          ))}
        </section>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{localizeMessage(toast)}</span>
          <IconButton label={t('Cerrar aviso')} onClick={() => setToast('')}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      {legalOpen && <LegalDialog close={() => setLegalOpen(false)} />}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <section
            ref={aboutRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            onClick={(event) => event.stopPropagation()}
          >
            <IconButton label={t('Cerrar información')} onClick={() => setModal(false)}>
              <X size={19} />
            </IconButton>
            <span className="brand-symbol">
              <AudioLines size={26} />
            </span>
            <h2 id="about-title">{t('Historias que se escuchan.')}</h2>
            <p>{t('Fábula {0} · Tus textos, con voz.', APP_VERSION)}</p>
            <p>
              {t(
                'Las voces en línea se generan mediante Microsoft Edge, sin clave de API de pago. Necesitan Internet y su disponibilidad puede cambiar. Tu texto se envía a Microsoft para sintetizarlo.'
              )}
            </p>
            <p>
              {t(
                'Las narraciones y el borrador se guardan en este equipo. Si una generación falla, puedes reanudarla desde tu biblioteca.'
              )}
            </p>
            <p>
              {t(
                'Importa Word, EPUB, ODT, RTF, HTML y texto. Los PDF escaneados e imágenes pueden reconocerse con el módulo OCR opcional.'
              )}
            </p>
            <p className="about-reference">
              {t(
                'Elige entre voces en línea y voces locales para adaptar cada lectura a tu gusto.'
              )}
            </p>
            <button
              className="secondary-button"
              onClick={() => {
                setModal(false)
                setLegalOpen(true)
              }}
            >
              {t('Privacidad y licencias')}
            </button>
            <button className="primary-button" onClick={() => setModal(false)}>
              {t('Volver a mis historias')}
              <ArrowUpRight size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  )
}
