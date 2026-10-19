import { t, localizeMessage } from '../../shared/i18n'
import { useState } from 'react'
import { Download, FolderOpen, Check, Trash2, Plus, CloudOff, LoaderCircle, X } from 'lucide-react'
import type { Preferences, ModuleState, ModuleKind } from '../../shared/studio'
import type { Draft, DesktopApi, VoiceInfo } from '../../shared/types'
import VoiceProfiles from './VoiceProfiles'
import AppearanceControls from './AppearanceControls'
import { PdfControls } from './PdfImportDialog'

type Props = {
  preferences: Preferences
  update: (value: Preferences) => void
  saveProfiles: (profiles: Preferences['profiles']) => Promise<void>
  voices: VoiceInfo[]
  busy: boolean
  applyProfile: (profile: Preferences['profiles'][number]) => void
  previewProfile: (profile: Preferences['profiles'][number]) => void
  draft: Draft
  setDraft: (value: Draft) => void
  modules: ModuleState[]
  api: () => DesktopApi
  notify: (text: string) => void
  error: (error: unknown) => void
}
export default function PreferencesPage({
  preferences: prefs,
  update,
  draft,
  setDraft,
  modules,
  api,
  notify,
  error,
  voices,
  busy,
  saveProfiles,
  applyProfile,
  previewProfile
}: Props) {
  const [written, setWritten] = useState(''),
    [spoken, setSpoken] = useState('')
  const change = (value: Partial<Preferences>) => update({ ...prefs, ...value })
  const downloading = modules.some((module) => ['downloading', 'verifying'].includes(module.status))
  async function install(kind: ModuleKind) {
    try {
      await api().installModule(kind)
      notify(t('Módulo instalado y listo para usar sin conexión.'))
    } catch (reason) {
      error(reason)
    }
  }
  function addPronunciation() {
    if (!written.trim() || !spoken.trim()) return
    if (
      prefs.pronunciations.some(
        (entry) => entry.written.toLocaleLowerCase() === written.trim().toLocaleLowerCase()
      )
    ) {
      notify(
        t('Ese nombre ya está en el diccionario. Elimina la entrada anterior para reemplazarla.')
      )
      return
    }
    change({
      pronunciations: [
        ...prefs.pronunciations,
        { id: crypto.randomUUID(), written: written.trim(), spoken: spoken.trim() }
      ]
    })
    setWritten('')
    setSpoken('')
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">{t('A TU MANERA')}</span>
        <h1>{t('Tu estudio, tu estilo.')}</h1>
        <p>{t('Guarda tus voces favoritas y adapta Fábula a cómo lees, escribes y escuchas.')}</p>
      </div>
      <div className="preferences-grid">
        <section className="feature-card full-width language-settings">
          <h2>{t('Idioma de la aplicación')}</h2>
          <p>
            {t(
              'Elige el idioma de menús, botones y mensajes. Tus textos, voces y el idioma de transcripción no se modifican.'
            )}
          </p>
          <label className="setting-line">
            {t('Idioma de la aplicación')}
            <select
              aria-label={t('Idioma de la aplicación')}
              value={prefs.language}
              onChange={(event) =>
                change({ language: event.target.value as Preferences['language'] })
              }
            >
              <option value="es" lang="es">
                Español
              </option>
              <option value="en" lang="en">
                English
              </option>
            </select>
          </label>
        </section>
        <VoiceProfiles
          profiles={prefs.profiles}
          voices={voices}
          draft={draft}
          busy={busy}
          save={saveProfiles}
          apply={applyProfile}
          preview={previewProfile}
          notify={notify}
          error={error}
        />
        <AppearanceControls preferences={prefs} update={update} />
        <section className="feature-card full-width">
          <h2>{t('Importación de PDF')}</h2>
          <p>
            {t(
              'Opciones iniciales para encabezados y pies. Podrás ajustarlas y revisar la vista previa en cada importación.'
            )}
          </p>
          <PdfControls value={prefs.pdfImport} change={(value) => change({ pdfImport: value })} />
        </section>
        <section className="feature-card full-width">
          <h2>{t('Aspecto y lectura')}</h2>
          <label className="setting-line">
            {t('Tema')}
            <select
              aria-label={t('Tema')}
              value={prefs.theme}
              onChange={(event) => change({ theme: event.target.value as Preferences['theme'] })}
            >
              <option value="dark">{t('Oscuro')}</option>
              <option value="light">{t('Claro')}</option>
            </select>
          </label>
          <label className="setting-line">
            {t('Color de acento')}
            <select
              value={prefs.accent}
              onChange={(event) => change({ accent: event.target.value as Preferences['accent'] })}
            >
              <option value="mint">{t('Menta')}</option>
              <option value="violet">{t('Violeta')}</option>
              <option value="blue">{t('Azul')}</option>
              <option value="rose">{t('Rosa')}</option>
              <option value="amber">{t('Ámbar')}</option>
              <option value="teal">{t('Turquesa')}</option>
            </select>
          </label>
          <label className="setting-line">
            {t('Tamaño de letra')}
            <strong>{prefs.editorFontSize} px</strong>
          </label>
          <input
            aria-label={t('Tamaño de letra del editor')}
            className="range"
            type="range"
            min="12"
            max="24"
            value={prefs.editorFontSize}
            onChange={(event) => change({ editorFontSize: +event.target.value })}
          />
          <label className="setting-line">
            {t('Anchura del texto')}
            <select
              value={prefs.editorWidth}
              onChange={(event) =>
                change({ editorWidth: event.target.value as Preferences['editorWidth'] })
              }
            >
              <option value="comfortable">{t('Lectura cómoda')}</option>
              <option value="wide">{t('Todo el ancho')}</option>
            </select>
          </label>
          <div className="preference-font-preview" style={{ fontSize: prefs.editorFontSize }}>
            {t('Cada historia tiene una voz.')}
          </div>
          <h3>{t('Carpeta de exportación')}</h3>
          <p className="folder-path">{prefs.exportFolder || t('Elegir ubicación al exportar')}</p>
          <div className="button-row">
            <button
              className="secondary-button"
              onClick={async () => {
                try {
                  const folder = await api().chooseExportFolder()
                  if (folder) change({ exportFolder: folder })
                } catch (reason) {
                  error(reason)
                }
              }}
            >
              <FolderOpen size={14} />
              {t('Elegir carpeta')}
            </button>
            {prefs.exportFolder && (
              <button className="text-button" onClick={() => change({ exportFolder: '' })}>
                {t('Restablecer')}
              </button>
            )}
          </div>
          <p className="feature-note">
            {t(
              'Atajos: Ctrl+Enter para narrar, Ctrl+O para importar y Ctrl+Mayús+N para una nueva historia.'
            )}
          </p>
        </section>
        <section className="feature-card full-width">
          <h2>{t('Diccionario de pronunciación')}</h2>
          <p>
            {t(
              'Indica cómo quieres que se lea una palabra, abreviatura o nombre. Por ejemplo, «Dr.» se leerá «doctor». Solo cambia el texto enviado al motor de voz; tu texto original se conserva.'
            )}
          </p>
          <div className="pronunciation-form">
            <label>
              {t('Se escribe')}
              <input
                aria-label={t('Nombre escrito')}
                placeholder="Dr."
                maxLength={120}
                value={written}
                onChange={(event) => setWritten(event.target.value)}
              />
            </label>
            <span>→</span>
            <label>
              {t('Se pronuncia')}
              <input
                aria-label={t('Pronunciación')}
                placeholder={t('doctor')}
                maxLength={200}
                value={spoken}
                onChange={(event) => setSpoken(event.target.value)}
              />
            </label>
            <button
              className="secondary-button"
              disabled={!written.trim() || !spoken.trim() || prefs.pronunciations.length >= 1000}
              onClick={addPronunciation}
            >
              <Plus size={14} />
              {t('Añadir')}
            </button>
          </div>
          <div className="dictionary-list">
            {prefs.pronunciations.map((entry) => (
              <div key={entry.id}>
                <b>{entry.written}</b>
                <span>→</span>
                <span>{entry.spoken}</span>
                <button
                  className="icon-button"
                  aria-label={t('Eliminar pronunciación de {0}', entry.written)}
                  onClick={() =>
                    change({
                      pronunciations: prefs.pronunciations.filter((item) => item.id !== entry.id)
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="feature-card full-width">
          <h2>{t('Módulos opcionales')}</h2>
          <p>
            {t(
              'Descarga cada módulo una vez. Después, el reconocimiento se realiza en tu equipo y sus archivos no se envían a un servicio externo.'
            )}
          </p>
          <div className="module-grid">
            {(['ocr', 'transcription'] as const).map((kind) => {
              const module = modules.find((item) => item.kind === kind),
                running = module && ['downloading', 'verifying'].includes(module.status)
              return (
                <article className="module-card" key={kind}>
                  <CloudOff size={23} />
                  <h3>{kind === 'ocr' ? t('Texto de imágenes · OCR') : t('Voz a texto')}</h3>
                  <p>
                    {kind === 'ocr'
                      ? t(
                          'Reconoce español en imágenes y páginas de PDF escaneadas. Descarga adicional: 2.3 MB.'
                        )
                      : t(
                          'Transcribe audios, videos y dictados con Whisper Base multilingüe. Windows x64 · descarga adicional: 157 MB.'
                        )}
                  </p>
                  {module?.installed ? (
                    <span className="installed-badge">
                      <Check size={14} />
                      {t('Instalado · funciona sin conexión')}
                    </span>
                  ) : (
                    <button
                      className="secondary-button"
                      disabled={downloading}
                      onClick={() => install(kind)}
                    >
                      {running ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      {running
                        ? module.status === 'verifying'
                          ? t('Verificando integridad…')
                          : t('Descargando {0} %', Math.round(module.progress * 100))
                        : t('Descargar módulo')}
                    </button>
                  )}
                  {running && (
                    <>
                      <progress max="1" value={module.progress} />
                      <button
                        className="text-button"
                        onClick={() => api().cancelModule().catch(error)}
                      >
                        <X size={12} />
                        {t('Cancelar descarga')}
                      </button>
                    </>
                  )}
                  {module?.error && (
                    <p className="form-error" role="status">
                      {localizeMessage(module.error)}
                    </p>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      </div>
    </>
  )
}
