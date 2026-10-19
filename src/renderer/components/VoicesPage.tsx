import { t, localizeMessage } from '../../shared/i18n'
import { useState } from 'react'
import {
  Upload,
  RefreshCw,
  Download,
  Trash2,
  Play,
  Check,
  ArrowUpRight,
  Search,
  LoaderCircle
} from 'lucide-react'
import type { DesktopApi, VoiceInfo } from '../../shared/types'
import type { ModuleState } from '../../shared/studio'
import VoiceArt from './VoiceArt'

export default function VoicesPage({
  voices,
  selected,
  busy,
  choose,
  preview,
  api,
  modules,
  notify,
  error
}: {
  voices: VoiceInfo[]
  selected: string
  busy: boolean
  choose: (id: string) => void
  preview: (id: string) => void
  api: () => DesktopApi
  modules: ModuleState[]
  notify: (text: string) => void
  error: (reason: unknown) => void
}) {
  const [filter, setFilter] = useState('all'),
    [query, setQuery] = useState(''),
    [name, setName] = useState(''),
    [speaker, setSpeaker] = useState(0),
    [pending, setPending] = useState(false)
  const piper = modules.find((module) => module.kind === 'piper'),
    downloading = modules.some((module) => ['downloading', 'verifying'].includes(module.status))
  const filtered = voices.filter(
    (voice) =>
      (filter === 'all' || filter === voice.provider) &&
      `${voice.name} ${voice.country} ${voice.gender}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase())
  )
  async function refresh() {
    setPending(true)
    try {
      await api().refreshVoices()
      notify(t('Voces instaladas de Windows actualizadas (32 y 64 bits).'))
    } catch (reason) {
      error(reason)
    } finally {
      setPending(false)
    }
  }
  async function importVoice() {
    setPending(true)
    try {
      if (await api().importVoice({ name: name.trim(), speaker })) {
        setName('')
        notify(t('Voz Piper importada. Ya puedes seleccionarla para narrar.'))
      }
    } catch (reason) {
      error(reason)
    } finally {
      setPending(false)
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">{t('UNA BIBLIOTECA DE VOCES PARA TUS LECTURAS')}</span>
        <h1>{t('Una voz para cada historia.')}</h1>
        <p>
          {t(
            'Compara voces neurales en español o usa voces locales para novelas, relatos, documentos y audiolibros.'
          )}
        </p>
      </div>
      <section className="feature-card external-voice-panel">
        <div className="external-voice-heading">
          <div>
            <h2>{t('Trae tus propias voces')}</h2>
            <p>
              {t('Importa modelos Piper con sus archivos')} <code>.onnx</code> {t('y')}{' '}
              <code>.onnx.json</code>
              {t('. También puedes usar las voces compatibles instaladas en Windows.')}
            </p>
          </div>
          <button className="secondary-button" disabled={pending} onClick={refresh}>
            <RefreshCw size={14} />
            {t('Buscar voces de Windows')}
          </button>
        </div>
        <div className="voice-import-form">
          <label>
            {t('Nombre para la voz')}
            <input
              aria-label={t('Nombre de la voz importada')}
              maxLength={100}
              value={name}
              placeholder={t('Opcional: mi narrador')}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            {t('Hablante')}
            <input
              aria-label={t('Hablante del modelo Piper')}
              type="number"
              min="0"
              max="9999"
              value={speaker}
              onChange={(event) =>
                setSpeaker(Math.max(0, Math.min(9999, +event.target.value || 0)))
              }
            />
          </label>
          <button className="primary-button" disabled={pending} onClick={importVoice}>
            {pending ? <LoaderCircle size={14} className="spin" /> : <Upload size={14} />}
            {t('Importar voz Piper')}
          </button>
        </div>
        <p className="feature-note">
          {t(
            'El hablante 0 es el habitual; solo cambia este valor en modelos con varias voces. Un archivo MP3 o WAV es una grabación, no un modelo que pueda narrar textos nuevos.'
          )}
        </p>
        {!piper?.installed ? (
          <div className="piper-engine-install">
            <span>
              {t(
                'Motor Piper local · descarga única de 22.5 MB. Las voces se importan por separado.'
              )}
            </span>
            <button
              className="secondary-button"
              disabled={downloading}
              onClick={async () => {
                try {
                  await api().installModule('piper')
                  notify(t('Motor Piper instalado. Puedes narrar con tus modelos sin conexión.'))
                } catch (reason) {
                  error(reason)
                }
              }}
            >
              <Download size={14} />
              {downloading && piper?.status === 'downloading'
                ? t('Descargando {0} %', Math.round(piper.progress * 100))
                : t('Instalar motor Piper')}
            </button>
            {piper?.status === 'downloading' && (
              <>
                <progress max="1" value={piper.progress} />
                <button className="text-button" onClick={() => api().cancelModule().catch(error)}>
                  {t('Cancelar descarga')}
                </button>
              </>
            )}
            {piper?.error && <p className="form-error">{localizeMessage(piper.error)}</p>}
          </div>
        ) : (
          <p className="installed-badge">
            <Check size={14} />
            {t('Motor Piper instalado · funciona sin conexión')}
          </p>
        )}
        <p className="feature-note">
          {t(
            'Cada modelo de voz tiene su propia licencia. Conserva la ficha MODEL_CARD que lo acompaña.'
          )}
        </p>
      </section>
      <div className="voices-toolbar">
        <div className="project-filters">
          {[
            ['all', t('Todas')],
            ['edge', t('Neurales en línea')],
            ['sapi', t('Instaladas en Windows')],
            ['piper', t('Piper importadas')]
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? 'selected' : ''}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={14} />
          <input
            aria-label={t('Buscar voces')}
            placeholder={t('Nombre, país o tipo de voz…')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="voice-gallery">
        {filtered.map((voice) => (
          <article className={`voice-card ${voice.id === selected ? 'chosen' : ''}`} key={voice.id}>
            <VoiceArt voice={voice} />
            <div className="voice-card-body">
              <div className="voice-card-title">
                <h2>{voice.name}</h2>
                <span>{voice.gender}</span>
              </div>
              <span className="voice-locale">
                {voice.country} ·{' '}
                {voice.provider === 'edge'
                  ? t('Neural · Internet')
                  : voice.provider === 'piper'
                    ? t('Piper · sin conexión')
                    : t('Windows · sin conexión')}
              </span>
              <p>{voice.description}</p>
              <div className="voice-card-actions">
                <button
                  className="secondary-button"
                  disabled={busy || (voice.provider === 'piper' && !piper?.installed)}
                  onClick={() => preview(voice.id)}
                >
                  <Play size={13} />
                  {t('Escuchar')}
                </button>
                <button
                  className={voice.id === selected ? 'voice-chosen' : 'voice-choose'}
                  onClick={() => choose(voice.id)}
                >
                  {voice.id === selected ? (
                    <>
                      <Check size={14} />
                      {t('Elegida')}
                    </>
                  ) : (
                    <>
                      {t('Elegir')}
                      <ArrowUpRight size={14} />
                    </>
                  )}
                </button>
                {voice.provider === 'piper' && (
                  <button
                    className="icon-button danger-action"
                    aria-label={t('Retirar voz {0}', voice.name)}
                    disabled={pending || busy}
                    onClick={async () => {
                      setPending(true)
                      try {
                        if (await api().removeVoice(voice.id))
                          notify(t('Voz retirada. Tus audios generados se conservan.'))
                      } catch (reason) {
                        error(reason)
                      } finally {
                        setPending(false)
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <p className="no-results">
          {t('No hay voces en este filtro. Importa un modelo o actualiza las voces de Windows.')}
        </p>
      )}
      <p className="page-footnote">
        {t(
          'Las voces neurales en línea envían el texto al servicio de Microsoft Edge. Las voces Windows y Piper se procesan en tu equipo. La disponibilidad y naturalidad dependen de cada voz.'
        )}
      </p>
    </>
  )
}
