import { t, getLanguage, localizeMessage, formatNumber } from '../../shared/i18n'
import { useMemo, useRef, useState } from 'react'
import {
  LibraryBig,
  FolderOpen,
  Plus,
  Search,
  Play,
  Pause,
  Download,
  FileText,
  Trash2,
  Pencil,
  X,
  Check,
  LoaderCircle,
  RotateCcw
} from 'lucide-react'
import { VOICES, type DesktopApi, type JobSummary, type VoiceInfo } from '../../shared/types'
import type { LibraryState, Project } from '../../shared/library'
import { useDialogFocus } from '../hooks/useDialogFocus'
import VoiceArt from './VoiceArt'
import { voiceInfo } from '../../shared/voice-catalogue'

const labels = () => ({
  generating: t('Narrando'),
  merging: t('Preparando MP3'),
  completed: t('Lista para escuchar'),
  cancelled: t('Cancelada'),
  failed: t('No se pudo completar'),
  interrupted: t('Lista para reanudar')
})
type Props = {
  voices: VoiceInfo[]
  jobs: JobSummary[]
  library: LibraryState
  filter: string
  setFilter: (id: string) => void
  currentId: string | null
  playing: boolean
  busy: boolean
  api: () => DesktopApi
  play: (job: JobSummary) => void
  exportAudio: (id: string) => void
  open: (job: JobSummary) => void
  resume: (job: JobSummary) => void
  remove: (job: JobSummary) => Promise<void>
  newStory: () => void
  error: (reason: unknown) => void
  notify: (text: string) => void
}
function ProjectDialog({
  project,
  close,
  save
}: {
  project: Project | null
  close: () => void
  save: (name: string, color: string) => Promise<void>
}) {
  const ref = useRef<HTMLElement>(null)
  useDialogFocus(ref, close)
  const [name, setName] = useState(project?.name ?? ''),
    [color, setColor] = useState(project?.color ?? '#a1ecc3'),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('')
  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (!saving) close()
      }}
    >
      <section
        className="feature-modal project-dialog"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="feature-modal-heading">
          <h2 id="project-dialog-title">{project ? t('Editar proyecto') : t('Nuevo proyecto')}</h2>
          <button
            className="icon-button"
            aria-label={t('Cerrar proyecto')}
            disabled={saving}
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (!name.trim() || saving) return
            setSaving(true)
            try {
              await save(name, color)
              close()
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
                  : String(reason)
              )
            } finally {
              setSaving(false)
            }
          }}
        >
          <label>
            {t('Nombre del proyecto')}
            <input
              autoFocus
              aria-label={t('Nombre del proyecto')}
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className="project-color">
            {t('Color del proyecto')}
            <input
              aria-label={t('Color del proyecto')}
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {localizeMessage(error)}
            </p>
          )}
          <div className="button-row">
            <button type="button" className="secondary-button" disabled={saving} onClick={close}>
              {t('Cancelar')}
            </button>
            <button type="submit" className="primary-button" disabled={saving || !name.trim()}>
              {saving ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}
              {project ? t('Guardar cambios') : t('Crear proyecto')}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
export default function LibraryPage({
  voices,
  jobs,
  library,
  filter,
  setFilter,
  currentId,
  playing,
  busy,
  api,
  play,
  exportAudio,
  open,
  resume,
  remove,
  newStory,
  error,
  notify
}: Props) {
  const [query, setQuery] = useState(''),
    [dialog, setDialog] = useState<{ project: Project | null } | null>(null),
    [pending, setPending] = useState<string | null>(null)
  const selected = library.projects.find((project) => project.id === filter)
  const counts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const job of jobs) {
      const id = library.assignments[job.id] ?? 'unassigned'
      result[id] = (result[id] ?? 0) + 1
    }
    return result
  }, [jobs, library.assignments])
  const filtered = jobs.filter(
    (job) =>
      (filter === 'all' ||
        (filter === 'unassigned'
          ? !library.assignments[job.id]
          : library.assignments[job.id] === filter)) &&
      job.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  )
  return (
    <>
      <div className="page-heading library-heading">
        <div>
          <span className="eyebrow">{t('HISTORIAS QUE COMPARTEN UN MUNDO')}</span>
          <h1>
            {selected?.name ?? (filter === 'unassigned' ? t('Sin proyecto.') : t('Tu biblioteca.'))}
          </h1>
          <p>
            {selected
              ? t('Las narraciones de este proyecto, juntas y listas para continuar.')
              : t('Organiza tus historias por proyecto y encuentra tu próxima escucha.')}
          </p>
        </div>
        <button className="primary-button" onClick={newStory}>
          <Plus size={16} />
          {t('Nueva narración')}
        </button>
      </div>
      <section className="project-collection" aria-label={t('Proyectos')}>
        <div className="project-section-heading">
          <h2>
            <FolderOpen size={16} />
            {t('Tus proyectos')} <span>{library.projects.length}</span>
          </h2>
          <button className="secondary-button" onClick={() => setDialog({ project: null })}>
            <Plus size={14} />
            {t('Nuevo proyecto')}
          </button>
        </div>
        <div className="project-filters">
          <button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>
            {t('Todas')} <span>{jobs.length}</span>
          </button>
          <button
            className={filter === 'unassigned' ? 'selected' : ''}
            onClick={() => setFilter('unassigned')}
          >
            {t('Sin proyecto')} <span>{counts.unassigned ?? 0}</span>
          </button>
        </div>
        <div className="project-grid">
          {library.projects.map((project) => (
            <article
              key={project.id}
              className={`project-card ${filter === project.id ? 'selected' : ''}`}
            >
              <button
                className="project-card-open"
                onClick={() => setFilter(project.id)}
                aria-label={t('Abrir proyecto {0}', project.name)}
                aria-pressed={filter === project.id}
              >
                <span className="project-folder" style={{ color: project.color }}>
                  <FolderOpen size={24} />
                </span>
                <span>
                  <b>{project.name}</b>
                  <small>
                    {counts[project.id] ?? 0}{' '}
                    {(counts[project.id] ?? 0) === 1 ? t('narración') : t('narraciones')}
                  </small>
                </span>
              </button>
              <div className="project-card-actions">
                <button
                  className="icon-button"
                  title={t('Editar proyecto')}
                  aria-label={t('Editar proyecto {0}', project.name)}
                  onClick={() => setDialog({ project })}
                >
                  <Pencil size={13} />
                </button>
                <button
                  className="icon-button danger-action"
                  disabled={pending !== null}
                  title={t('Eliminar proyecto conservando sus narraciones')}
                  aria-label={t('Eliminar proyecto {0}', project.name)}
                  onClick={async () => {
                    setPending(project.id)
                    try {
                      if (await api().deleteProject(project.id)) {
                        if (filter === project.id) setFilter('unassigned')
                        notify(
                          t('Proyecto eliminado. Sus narraciones se conservaron sin proyecto.')
                        )
                      }
                    } catch (reason) {
                      error(reason)
                    } finally {
                      setPending(null)
                    }
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </article>
          ))}
        </div>
        {!library.projects.length && (
          <p className="project-empty-note">
            {t('Crea un proyecto para reunir capítulos, versiones o historias del mismo universo.')}
          </p>
        )}
      </section>
      <div className="library-tools">
        <span>
          {filtered.length} {filtered.length === 1 ? t('narración') : t('narraciones')}
          {selected ? t(' en {0}', selected.name) : ''}
        </span>
        <label className="search-box">
          <Search size={15} />
          <input
            aria-label={t('Buscar narraciones')}
            placeholder={t('Buscar una historia…')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {!jobs.length ? (
        <div className="library-empty">
          <span>
            <LibraryBig size={35} strokeWidth={1.3} />
          </span>
          <h2>{t('El comienzo de tu colección.')}</h2>
          <p>{t('Tu primera narración está a unas palabras de distancia.')}</p>
          <button className="secondary-button" onClick={newStory}>
            {t('Ir al estudio')}
          </button>
        </div>
      ) : (
        <div className="library-list">
          {filtered.map((job, index) => (
            <article className="library-item" key={job.id} data-job-id={job.id}>
              <span className="track-number">{String(index + 1).padStart(2, '0')}</span>
              <VoiceArt voice={voiceInfo(job.settings.voice, voices)} small />
              <div className="track-description">
                <h3>{job.title}</h3>
                <p>
                  {voiceInfo(job.settings.voice, voices).name} ·{' '}
                  {new Intl.NumberFormat(getLanguage()).format(job.words)} {t('palabras ·')}{' '}
                  {formatNumber(job.settings.speed)}×
                </p>
                <span className={`status-pill ${job.status}`}>{labels()[job.status]}</span>
                {job.error && (
                  <details className="job-error">
                    <summary>{t('Ver detalle')}</summary>
                    {localizeMessage(job.error)}
                  </details>
                )}
                <label className="narration-project">
                  <FolderOpen size={12} />
                  <select
                    aria-label={t('Proyecto de {0}', job.title)}
                    disabled={pending !== null}
                    value={library.assignments[job.id] ?? ''}
                    onChange={async (event) => {
                      const value = event.target.value
                      setPending(job.id)
                      try {
                        await api().assignProject(job.id, value || null)
                      } catch (reason) {
                        error(reason)
                      } finally {
                        setPending(null)
                      }
                    }}
                  >
                    <option value="">{t('Sin proyecto')}</option>
                    {library.projects.map((project) => (
                      <option value={project.id} key={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <time dateTime={job.createdAt}>
                {new Date(job.createdAt).toLocaleString(getLanguage(), {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </time>
              <div className="track-actions">
                {job.status === 'completed' ? (
                  <>
                    <button
                      className="icon-button"
                      aria-label={t('Reproducir {0}', job.title)}
                      title={t('Reproducir')}
                      onClick={() => play(job)}
                    >
                      {playing && currentId === job.id ? <Pause size={18} /> : <Play size={18} />}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={t('Exportar {0} como MP3', job.title)}
                      title={t('Exportar MP3')}
                      onClick={() => exportAudio(job.id)}
                    >
                      <Download size={17} />
                    </button>
                  </>
                ) : ['failed', 'interrupted', 'cancelled'].includes(job.status) ? (
                  <button className="secondary-button" disabled={busy} onClick={() => resume(job)}>
                    <RotateCcw size={14} />
                    {t('Reanudar')}
                  </button>
                ) : (
                  <LoaderCircle size={18} className="spin" />
                )}
                <button
                  className="icon-button"
                  aria-label={t('Abrir texto de {0}', job.title)}
                  title={t('Abrir texto')}
                  onClick={() => open(job)}
                >
                  <FileText size={17} />
                </button>
                <button
                  className="icon-button danger-action"
                  title={
                    ['generating', 'merging'].includes(job.status)
                      ? t('Cancela la narración antes de borrarla')
                      : t('Borrar narración')
                  }
                  aria-label={t('Borrar narración {0}', job.title)}
                  disabled={pending !== null || ['generating', 'merging'].includes(job.status)}
                  onClick={async () => {
                    setPending(job.id)
                    try {
                      await remove(job)
                    } finally {
                      setPending(null)
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
          {!filtered.length && (
            <p className="no-results">
              {query
                ? t('No hay historias que coincidan con tu búsqueda.')
                : t(
                    'Este grupo todavía no tiene narraciones. Puedes moverlas aquí desde «Sin proyecto» o crear una nueva.'
                  )}
            </p>
          )}
        </div>
      )}
      {dialog && (
        <ProjectDialog
          project={dialog.project}
          close={() => setDialog(null)}
          save={async (name, color) => {
            await api().saveProject({ id: dialog.project?.id, name, color })
            notify(
              dialog.project
                ? t('Proyecto actualizado.')
                : t('Proyecto creado. Ya puedes añadir narraciones.')
            )
          }}
        />
      )}
    </>
  )
}
