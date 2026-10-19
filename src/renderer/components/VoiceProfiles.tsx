import { t, getLanguage, formatNumber, localizeMessage } from '../../shared/i18n'
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
      setMessage(t('Escribe un nombre para reconocer estos ajustes.'))
      return
    }
    if (
      profiles.some(
        (item) => item.id !== editing && item.name.toLocaleLowerCase() === name.toLocaleLowerCase()
      )
    ) {
      setMessage(t('Ya hay un perfil con ese nombre. Elige otro.'))
      return
    }
    if (!editing && profiles.length >= 100) {
      setMessage(t('Puedes guardar hasta 100 perfiles. Edita o elimina uno para continuar.'))
      return
    }
    if (!voice) {
      setMessage(t('Esta voz ya no está disponible. Elige otra antes de guardar.'))
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
          ? t('Cambios del perfil guardados.')
          : t('Perfil guardado. Ya puedes usarlo en el estudio.')
      )
    } catch (reason) {
      error(reason)
    } finally {
      setPending(false)
    }
  }
  async function remove(profile: Profile) {
    if (
      !(await window.fabula!.confirm(
        t(
          '¿Eliminar el perfil «{0}»? Las narraciones que hayas creado se conservarán.',
          profile.name
        )
      ))
    )
      return
    setPending(true)
    try {
      await save(profiles.filter((item) => item.id !== profile.id))
      if (editing === profile.id) reset()
      notify(t('Perfil eliminado.'))
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
          <h2 id="profiles-title">{t('Perfiles de voz')}</h2>
          <p>
            {t(
              'Un perfil es una combinación de voz y ritmo que puedes reutilizar en cualquier narración.'
            )}
          </p>
        </div>
        <button className="secondary-button" disabled={pending} onClick={reset}>
          <Plus size={14} />
          {t('Nuevo perfil')}
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
          <h3>{editing ? t('Editar perfil') : t('Crear un perfil')}</h3>
          <p className="profile-help">
            {t('Elige los ajustes, escucha cómo suenan y guárdalos con un nombre.')}
          </p>
          <fieldset disabled={pending}>
            <label>
              {t('Nombre del perfil')}
              <input
                aria-label={t('Nombre del perfil')}
                placeholder={t('Por ejemplo: Lectura tranquila')}
                maxLength={60}
                value={editor.name}
                onChange={(event) => {
                  setEditor({ ...editor, name: event.target.value })
                  setMessage('')
                }}
              />
            </label>
            <label>
              {t('Voz')}
              <select
                aria-label={t('Voz del perfil')}
                value={editor.settings.voice}
                onChange={(event) => change({ voice: event.target.value })}
              >
                {!voice && (
                  <option value={editor.settings.voice}>
                    {t('Voz no disponible · elige otra')}
                  </option>
                )}
                {voices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.country} ·{' '}
                    {item.provider === 'edge' ? t('en línea') : 'local'}
                  </option>
                ))}
              </select>
            </label>
            <div className="profile-controls">
              <label>
                {t('Velocidad')}{' '}
                <output>
                  {formatNumber(editor.settings.speed, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                  ×
                </output>
                <input
                  className="range"
                  aria-label={t('Velocidad del perfil')}
                  type="range"
                  min="0.5"
                  max="1.75"
                  step="0.05"
                  value={editor.settings.speed}
                  onChange={(event) => change({ speed: +event.target.value })}
                />
                <small>{t('Más lenta ← → Más rápida')}</small>
              </label>
              <label>
                {t('Tono')}{' '}
                <output>
                  {editor.settings.pitch > 0 ? '+' : ''}
                  {editor.settings.pitch} Hz
                </output>
                <input
                  className="range"
                  aria-label={t('Tono del perfil')}
                  type="range"
                  min="-30"
                  max="30"
                  step="1"
                  value={editor.settings.pitch}
                  onChange={(event) => change({ pitch: +event.target.value })}
                />
                <small>{t('Más grave ← → Más agudo')}</small>
              </label>
              <label>
                {t('Volumen')} <output>{Math.round(editor.settings.volume * 100)} %</output>
                <input
                  className="range"
                  aria-label={t('Volumen del perfil')}
                  type="range"
                  min="0.3"
                  max="1"
                  step="0.05"
                  value={editor.settings.volume}
                  onChange={(event) => change({ volume: +event.target.value })}
                />
              </label>
              <label>
                {t('Pausa entre párrafos')}{' '}
                <output>{(editor.pauseMs / 1000).toLocaleString(getLanguage())} s</output>
                <input
                  className="range"
                  aria-label={t('Pausa del perfil')}
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
                ? t('La muestra usa una voz en línea: el texto se envía a Microsoft.')
                : t(
                    'Esta voz se procesa en tu equipo. El tono se ajusta mediante un efecto de audio.'
                  )}
            </p>
            {message && (
              <p role="alert" className="form-error">
                {localizeMessage(message)}
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
                {t('Escuchar muestra')}
              </button>
              <button type="submit" className="primary-button">
                {pending ? t('Guardando…') : editing ? t('Guardar cambios') : t('Guardar perfil')}
              </button>
              {editing && (
                <button type="button" className="text-button" onClick={reset}>
                  {t('Cancelar edición')}
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
                  t(
                    'Ajustes del estudio copiados al formulario. Puedes revisarlos antes de guardar.'
                  )
                )
              }}
            >
              {t('Copiar los ajustes actuales del estudio')}
            </button>
          </fieldset>
        </form>
        <div className="profile-library">
          <h3>
            {t('Tus perfiles guardados')} <span>{profiles.length}</span>
          </h3>
          <p className="profile-help">
            {t('«Usar en el estudio» prepara la próxima narración con esos ajustes.')}
          </p>
          {!profiles.length && (
            <div className="profile-empty">
              <Check size={25} />
              <h4>{t('Guarda tu primera combinación')}</h4>
              <p>
                {t(
                  'Por ejemplo, «Lectura tranquila»: una voz a velocidad reducida y con pausas largas. Después podrás elegirla desde el estudio.'
                )}
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
                    : t('Voz no disponible · edita el perfil para elegir otra')}
                </p>
                <dl>
                  <div>
                    <dt>{t('Velocidad')}</dt>
                    <dd>{formatNumber(profile.settings.speed)}×</dd>
                  </div>
                  <div>
                    <dt>{t('Tono')}</dt>
                    <dd>
                      {profile.settings.pitch > 0 ? '+' : ''}
                      {profile.settings.pitch} Hz
                    </dd>
                  </div>
                  <div>
                    <dt>{t('Volumen')}</dt>
                    <dd>{Math.round(profile.settings.volume * 100)} %</dd>
                  </div>
                  <div>
                    <dt>{t('Pausa')}</dt>
                    <dd>{(profile.pauseMs / 1000).toLocaleString(getLanguage())} s</dd>
                  </div>
                </dl>
                <div className="button-row">
                  <button
                    className="secondary-button"
                    disabled={pending || !available}
                    onClick={() => apply(profile)}
                  >
                    {t('Usar en el estudio')}
                  </button>
                  <button
                    className="text-button"
                    aria-label={t('Editar perfil {0}', profile.name)}
                    disabled={pending}
                    onClick={() => {
                      setEditor({ ...profile, settings: { ...profile.settings } })
                      setEditing(profile.id)
                      setMessage('')
                    }}
                  >
                    <Pencil size={13} />
                    {t('Editar')}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={t('Eliminar perfil {0}', profile.name)}
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
