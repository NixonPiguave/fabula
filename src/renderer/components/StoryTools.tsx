import { t, getLanguage } from '../../shared/i18n'
import { useMemo, useState, useRef } from 'react'
import { X, Check, WandSparkles, BookOpen, RotateCcw } from 'lucide-react'
import { chaptersOf, paragraphsOf, cleanText } from '../../shared/studio'
import { VOICES, type Draft, type VoiceId, type VoiceInfo } from '../../shared/types'
import { useDialogFocus } from '../hooks/useDialogFocus'

export default function StoryTools({
  voices,
  draft,
  update,
  close,
  onRegenerate,
  busy
}: {
  voices: VoiceInfo[]
  draft: Draft
  update: (value: Draft) => void
  close: () => void
  onRegenerate: (value: Draft) => void
  busy: boolean
}) {
  const dialogRef = useRef<HTMLElement>(null)
  useDialogFocus(dialogRef, close)
  const [tab, setTab] = useState<'chapters' | 'paragraphs' | 'cleanup'>('chapters')
  const [options, setOptions] = useState({
    joinLines: false,
    pageNumbers: true,
    repeatedLines: false
  })
  const [selected, setSelected] = useState(0)
  const paragraphs = useMemo(() => paragraphsOf(draft.text), [draft.text]),
    chapters = useMemo(() => chaptersOf(draft.text), [draft.text, getLanguage()])
  const cleaned = useMemo(() => cleanText(draft.text, options), [draft.text, options])
  const paragraph = paragraphs[Math.min(selected, paragraphs.length - 1)]
  const override = paragraph ? draft.blockOverrides?.[paragraph.id] : undefined
  const [replacement, setReplacement] = useState('')
  function select(index: number) {
    setSelected(index)
    setReplacement(paragraphs[index]?.text ?? '')
  }
  function applyParagraph(regenerate: boolean) {
    if (!paragraph || !replacement.trim()) return
    const text =
      draft.text.slice(0, paragraph.start) + replacement + draft.text.slice(paragraph.end)
    const next = { ...draft, text, blockOverrides: { ...draft.blockOverrides } }
    const changed = paragraphsOf(text).find((entry) => entry.start === paragraph.start)
    if (changed && override) {
      delete next.blockOverrides[paragraph.id]
      next.blockOverrides[changed.id] = override
    }
    update(next)
    if (regenerate) {
      close()
      onRegenerate(next)
    }
  }
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        ref={dialogRef}
        className="story-tools-modal feature-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-tools-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="feature-modal-heading">
          <div>
            <span className="eyebrow">{t('PREPARA CADA DETALLE')}</span>
            <h2 id="story-tools-title">{t('Herramientas de la historia')}</h2>
          </div>
          <button className="icon-button" aria-label={t('Cerrar herramientas')} onClick={close}>
            <X size={19} />
          </button>
        </div>
        <div className="feature-tabs">
          <button
            className={tab === 'chapters' ? 'selected' : ''}
            onClick={() => setTab('chapters')}
          >
            {t('Capítulos (')}
            {chapters.length})
          </button>
          <button
            className={tab === 'paragraphs' ? 'selected' : ''}
            onClick={() => {
              setTab('paragraphs')
              select(0)
            }}
          >
            {t('Párrafos y personajes')}
          </button>
          <button className={tab === 'cleanup' ? 'selected' : ''} onClick={() => setTab('cleanup')}>
            {t('Limpiar texto')}
          </button>
        </div>
        {tab === 'chapters' && (
          <div className="tool-section">
            <p>
              {t(
                'Los títulos como «Capítulo 1», «Parte II», «Prólogo» y «Epílogo» se detectan automáticamente. Al narrar, podrás exportar un MP3 completo o uno por capítulo.'
              )}
            </p>
            <div className="chapter-list">
              {chapters.map((chapter, index) => (
                <div key={`${chapter.start}`}>
                  <BookOpen size={16} />
                  <span>
                    <b>{chapter.title}</b>
                    <small>
                      {draft.text.slice(chapter.start, chapter.end).trim().split(/\s+/).length}{' '}
                      {t('palabras')}
                    </small>
                  </span>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                </div>
              ))}
            </div>
            {!chapters.length && (
              <p className="feature-empty">{t('Escribe o importa una historia primero.')}</p>
            )}
          </div>
        )}
        {tab === 'paragraphs' && (
          <div className="paragraph-tool">
            <div className="paragraph-list">
              {paragraphs.map((entry, index) => (
                <button
                  key={entry.id}
                  className={paragraph?.id === entry.id ? 'selected' : ''}
                  onClick={() => select(index)}
                >
                  <b>
                    {t('Párrafo')} {index + 1}
                  </b>
                  <span>{entry.text.slice(0, 100)}</span>
                  <small>
                    {draft.blockOverrides?.[entry.id]?.voice
                      ? voices.find((voice) => voice.id === draft.blockOverrides?.[entry.id]?.voice)
                          ?.name
                      : t('Voz general')}
                  </small>
                </button>
              ))}
            </div>
            {paragraph ? (
              <div className="paragraph-detail">
                <label className="field-label" htmlFor="paragraph-edit">
                  {t('TEXTO DEL PÁRRAFO')}
                </label>
                <textarea
                  id="paragraph-edit"
                  value={replacement}
                  onChange={(event) => setReplacement(event.target.value)}
                />
                <label>
                  {t('Voz de este fragmento')}
                  <select
                    aria-label={t('Voz del personaje o fragmento')}
                    value={override?.voice ?? ''}
                    onChange={(event) =>
                      update({
                        ...draft,
                        blockOverrides: {
                          ...draft.blockOverrides,
                          [paragraph.id]: {
                            ...override,
                            voice: (event.target.value || undefined) as VoiceId | undefined
                          }
                        }
                      })
                    }
                  >
                    <option value="">{t('Usar la voz general')}</option>
                    {voices.map((voice) => (
                      <option value={voice.id} key={voice.id}>
                        {voice.name} · {voice.country}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('Pausa después del fragmento')}
                  <select
                    aria-label={t('Pausa del fragmento')}
                    value={override?.pauseMs ?? ''}
                    onChange={(event) =>
                      update({
                        ...draft,
                        blockOverrides: {
                          ...draft.blockOverrides,
                          [paragraph.id]: {
                            ...override,
                            pauseMs: event.target.value === '' ? undefined : +event.target.value
                          }
                        }
                      })
                    }
                  >
                    <option value="">{t('Usar pausa general')}</option>
                    <option value="0">{t('Sin pausa adicional')}</option>
                    <option value="350">{t('Breve · 350 ms')}</option>
                    <option value="750">{t('Media · 750 ms')}</option>
                    <option value="1500">{t('Larga · 1.5 s')}</option>
                  </select>
                </label>
                <div className="button-row">
                  <button
                    className="secondary-button"
                    disabled={!replacement.trim()}
                    onClick={() => applyParagraph(false)}
                  >
                    <Check size={14} />
                    {t('Aplicar cambio')}
                  </button>
                  <button
                    className="primary-button"
                    disabled={busy || !replacement.trim()}
                    onClick={() => applyParagraph(true)}
                  >
                    <RotateCcw size={14} />
                    {t('Guardar y regenerar')}
                  </button>
                </div>
                <p className="feature-note">
                  {t(
                    'Se creará una nueva versión. Los fragmentos idénticos y sus ajustes se reutilizan; solo el audio que cambió se vuelve a solicitar.'
                  )}
                </p>
              </div>
            ) : (
              <p>{t('Tu historia todavía no tiene párrafos.')}</p>
            )}
          </div>
        )}
        {tab === 'cleanup' && (
          <div className="tool-section">
            <div className="cleanup-options">
              {(
                [
                  ['pageNumbers', t('Quitar números de página')],
                  ['joinLines', t('Unir saltos dentro de párrafos')],
                  ['repeatedLines', t('Quitar líneas repetidas 3 veces o más')]
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={options[key]}
                    onChange={(event) =>
                      setOptions((previous) => ({ ...previous, [key]: event.target.checked }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <p>
              {t(
                'Revisa la propuesta antes de aplicarla. La eliminación de líneas repetidas puede afectar estribillos o diálogos intencionales.'
              )}
            </p>
            <div className="cleanup-preview">
              <div>
                <h3>{t('Original')}</h3>
                <pre>{draft.text}</pre>
              </div>
              <div>
                <h3>
                  {t('Propuesta ·')} {cleaned.removed.length} {t('líneas retiradas')}
                </h3>
                <pre>{cleaned.text}</pre>
              </div>
            </div>
            <button
              className="primary-button"
              disabled={cleaned.text === draft.text || !cleaned.text.trim()}
              onClick={() => {
                update({ ...draft, text: cleaned.text, blockOverrides: {} })
                close()
              }}
            >
              <WandSparkles size={15} />
              {t('Aplicar limpieza revisada')}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
