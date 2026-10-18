import { useState } from 'react'
import { Check, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import type { Preferences } from '../../shared/studio'
import type { Draft, VoiceInfo } from '../../shared/types'

type Profile = Preferences['profiles'][number]
type Props = {
  profiles: Profile[]
  voices: VoiceInfo[]
  draft: Draft
  busy: boolean
  save: (profiles: Profile[]) => Promise<void>
  apply: (profile: Profile) => void
  preview: (profile: Profile) => void
  notify: (message: string) => void
  error: (reason: unknown) => void
}
export default function VoiceProfiles({
  profiles,
  voices,
  draft,
  busy,
  save,
  apply,
  preview,
  notify,
  error
}: Props) {
  const fresh = (): Profile => ({
    id: crypto.randomUUID(),
    name: '',
    settings: { ...draft.settings },
    pauseMs: draft.pauseMs ?? 350
  })
  const [editor, setEditor] = useState<Profile>(fresh)
  const [editing, setEditing] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const voice = voices.find((item) => item.id === editor.settings.voice)
  const change = (value: Partial<Profile['settings']>) =>
    setEditor((previous) => ({ ...previous, settings: { ...previous.settings, ...value } }))
  function reset() {
    setEditor(fresh())
    setEditing(null)
    setMessage('')
  }
  async function commit() {
    const name = editor.name.trim()
    if (!name) {
      setMessage('Escribe un nombre para reconocer estos ajustes.')
      return
    }
    if (
      profiles.some(
        (item) => item.id !== editing && item.name.toLocaleLowerCase() === name.toLocaleLowerCase()
      )
    ) {
      setMessage('Ya hay un perfil con ese nombre. Elige otro.')
      return
    }
    if (!editing && profiles.length >= 100) {
      setMessage('Puedes guardar hasta 100 perfiles. Edita o elimina uno para continuar.')
      return
    }
    if (!voice) {
      setMessage('Esta voz ya no está disponible. Elige otra antes de guardar.')
      return
    }
    const profile = { ...editor, name, settings: { ...editor.settings } }
    setPending(true)
    setMessage('')
    try {
      await save(
        editing
          ? profiles.map((item) => (item.id === editing ? profile : item))
          : [...profiles, profile]
      )
      reset()
      notify(
        editing
          ? 'Cambios del perfil guardados.'
          : 'Perfil guardado. Ya puedes usarlo en el estudio.'
      )
    } catch (reason) {
      error(reason)
    } finally {
      setPending(false)
    }
  }
  async function remove(profile: Profile) {
    if (
      !window.confirm(
        `¿Eliminar el perfil «${profile.name}»? Las narraciones que hayas creado se conservarán.`
      )
    )
      return
    setPending(true)
    try {
      await save(profiles.filter((item) => item.id !== profile.id))
      if (editing === profile.id) reset()
      notify('Perfil eliminado.')
    } catch (reason) {
      error(reason)
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="feature-card full-width voice-profiles" aria-labelledby="profiles-title">
      <div className="profiles-heading">
        <div>
          <h2 id="profiles-title">Perfiles de voz</h2>
          <p>
            Un perfil es una combinación de voz y ritmo que puedes reutilizar en cualquier
            narración.
          </p>
        </div>
        <button className="secondary-button" disabled={pending} onClick={reset}>
          <Plus size={14} />
          Nuevo perfil
        </button>
      </div>
      <div className="profiles-layout">
        <form
          noValidate
          className="profile-editor"
          onSubmit={(event) => {
            event.preventDefault()
            void commit()
          }}
        >
          <h3>{editing ? 'Editar perfil' : 'Crear un perfil'}</h3>
          <p className="profile-help">
            Elige los ajustes, escucha cómo suenan y guárdalos con un nombre.
          </p>
          <fieldset disabled={pending}>
            <label>
              Nombre del perfil
              <input
                aria-label="Nombre del perfil"
                placeholder="Por ejemplo: Lectura tranquila"
                maxLength={60}
                value={editor.name}
                onChange={(event) => {
                  setEditor({ ...editor, name: event.target.value })
                  setMessage('')
                }}
              />
            </label>
            <label>
              Voz
              <select
                aria-label="Voz del perfil"
                value={editor.settings.voice}
                onChange={(event) => change({ voice: event.target.value })}
              >
                {!voice && (
                  <option value={editor.settings.voice}>Voz no disponible · elige otra</option>
                )}
                {voices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.country} · {item.provider === 'edge' ? 'en línea' : 'local'}
                  </option>
                ))}
              </select>
            </label>
            <div className="profile-controls">
              <label>
                Velocidad <output>{editor.settings.speed.toFixed(2)}×</output>
                <input
                  className="range"
                  aria-label="Velocidad del perfil"
                  type="range"
                  min="0.5"
                  max="1.75"
                  step="0.05"
                  value={editor.settings.speed}
                  onChange={(event) => change({ speed: +event.target.value })}
                />
                <small>Más lenta ← → Más rápida</small>
              </label>
              <label>
                Tono{' '}
                <output>
                  {editor.settings.pitch > 0 ? '+' : ''}
                  {editor.settings.pitch} Hz
                </output>
                <input
                  className="range"
                  aria-label="Tono del perfil"
                  type="range"
                  min="-30"
                  max="30"
                  step="1"
                  value={editor.settings.pitch}
                  onChange={(event) => change({ pitch: +event.target.value })}
                />
                <small>Más grave ← → Más agudo</small>
              </label>
              <label>
                Volumen <output>{Math.round(editor.settings.volume * 100)} %</output>
                <input
                  className="range"
                  aria-label="Volumen del perfil"
                  type="range"
                  min="0.3"
                  max="1"
                  step="0.05"
                  value={editor.settings.volume}
                  onChange={(event) => change({ volume: +event.target.value })}
                />
              </label>
              <label>
                Pausa entre párrafos{' '}
                <output>{(editor.pauseMs / 1000).toLocaleString('es')} s</output>
                <input
                  className="range"
                  aria-label="Pausa del perfil"
                  type="range"
                  min="0"
                  max="3000"
                  step="50"
                  value={editor.pauseMs}
                  onChange={(event) => setEditor({ ...editor, pauseMs: +event.target.value })}
                />
              </label>
            </div>
            <p className="profile-help">
              {voice?.provider === 'edge'
                ? 'La muestra usa una voz en línea: el texto se envía a Microsoft.'
                : 'Esta voz se procesa en tu equipo. El tono se ajusta mediante un efecto de audio.'}
            </p>
            {message && (
              <p role="alert" className="form-error">
                {message}
              </p>
            )}
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                disabled={busy || !voice}
                onClick={() => preview(editor)}
              >
                <Play size={14} />
                Escuchar muestra
              </button>
              <button type="submit" className="primary-button">
                {pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar perfil'}
              </button>
              {editing && (
                <button type="button" className="text-button" onClick={reset}>
                  Cancelar edición
                </button>
              )}
            </div>
            <button
              type="button"
              className="text-button profile-copy"
              onClick={() => {
                setEditor({
                  ...editor,
                  settings: { ...draft.settings },
                  pauseMs: draft.pauseMs ?? 350
                })
                setMessage('')
                notify(
                  'Ajustes del estudio copiados al formulario. Puedes revisarlos antes de guardar.'
                )
              }}
            >
              Copiar los ajustes actuales del estudio
            </button>
          </fieldset>
        </form>
        <div className="profile-library">
          <h3>
            Tus perfiles guardados <span>{profiles.length}</span>
          </h3>
          <p className="profile-help">
            «Usar en el estudio» prepara la próxima narración con esos ajustes.
          </p>
          {!profiles.length && (
            <div className="profile-empty">
              <Check size={25} />
              <h4>Guarda tu primera combinación</h4>
              <p>
                Por ejemplo, «Lectura tranquila»: una voz a velocidad reducida y con pausas largas.
                Después podrás elegirla desde el estudio.
              </p>
            </div>
          )}
          {profiles.map((profile) => {
            const available = voices.find((item) => item.id === profile.settings.voice)
            return (
              <article
                className={`saved-profile${editing === profile.id ? ' editing' : ''}`}
                key={profile.id}
              >
                <h4>{profile.name}</h4>
                <p className="profile-voice">
                  {available
                    ? `${available.name} · ${available.country}`
                    : 'Voz no disponible · edita el perfil para elegir otra'}
                </p>
                <dl>
                  <div>
                    <dt>Velocidad</dt>
                    <dd>{profile.settings.speed}×</dd>
                  </div>
                  <div>
                    <dt>Tono</dt>
                    <dd>
                      {profile.settings.pitch > 0 ? '+' : ''}
                      {profile.settings.pitch} Hz
                    </dd>
                  </div>
                  <div>
                    <dt>Volumen</dt>
                    <dd>{Math.round(profile.settings.volume * 100)} %</dd>
                  </div>
                  <div>
                    <dt>Pausa</dt>
                    <dd>{(profile.pauseMs / 1000).toLocaleString('es')} s</dd>
                  </div>
                </dl>
                <div className="button-row">
                  <button
                    className="secondary-button"
                    disabled={pending || !available}
                    onClick={() => apply(profile)}
                  >
                    Usar en el estudio
                  </button>
                  <button
                    className="text-button"
                    aria-label={`Editar perfil ${profile.name}`}
                    disabled={pending}
                    onClick={() => {
                      setEditor({ ...profile, settings: { ...profile.settings } })
                      setEditing(profile.id)
                      setMessage('')
                    }}
                  >
                    <Pencil size={13} />
                    Editar
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Eliminar perfil ${profile.name}`}
                    disabled={pending}
                    onClick={() => void remove(profile)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
