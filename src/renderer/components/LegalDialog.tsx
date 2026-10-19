import { t, getLanguage } from '../../shared/i18n'
import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import privacyEnglish from '../../../docs/en/PRIVACY.txt?raw'
import noticesEnglish from '../../../docs/en/USAGE_NOTICES.txt?raw'
import thirdPartyEnglish from '../../../docs/en/THIRD_PARTY.txt?raw'
import privacy from '../../../PRIVACIDAD.txt?raw'
import notices from '../../../AVISOS_DE_USO.txt?raw'
import license from '../../../LICENSE.txt?raw'
import thirdParty from '../../../TERCEROS.txt?raw'
import componentLicenses from '../../../LICENCIAS_DE_COMPONENTES.txt?raw'
import canvasLicenses from '../../../assets/licenses/CANVAS-NATIVE-NOTICES.txt?raw'
import ocrLicenses from '../../../assets/licenses/OCR-NATIVE-NOTICES.txt?raw'
import { useDialogFocus } from '../hooks/useDialogFocus'

type DocumentId = 'privacy' | 'notices' | 'license' | 'thirdParty'
export default function LegalDialog({ close }: { close: () => void }) {
  const english = getLanguage() === 'en'
  const documents = {
    privacy: { title: t('Privacidad'), text: english ? privacyEnglish : privacy },
    notices: { title: t('Avisos de uso'), text: english ? noticesEnglish : notices },
    license: { title: t('Licencia GPL'), text: license },
    thirdParty: {
      title: t('Terceros'),
      text: [
        english ? thirdPartyEnglish : thirdParty,
        componentLicenses,
        canvasLicenses,
        ocrLicenses
      ].join('\n\n')
    }
  }
  const [selected, setSelected] = useState<DocumentId>('privacy')
  const ref = useRef<HTMLElement>(null)
  useDialogFocus(ref, close)
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className="modal legal-dialog"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="icon-button" aria-label={t('Cerrar documentos legales')} onClick={close}>
          <X size={19} />
        </button>
        <h2 id="legal-title">{t('Privacidad y licencias')}</h2>
        <p>
          {t('Consulta qué datos se procesan y las condiciones del programa y sus componentes.')}
        </p>
        {(selected === 'license' || selected === 'thirdParty') && (
          <p className="feature-note">
            {t('Los textos originales de las licencias se conservan en su idioma original.')}
          </p>
        )}
        <div className="legal-tabs" aria-label={t('Documentos legales')}>
          {Object.entries(documents).map(([id, doc]) => (
            <button
              key={id}
              aria-pressed={selected === id}
              className={selected === id ? 'selected' : ''}
              onClick={() => setSelected(id as keyof typeof documents)}
            >
              {doc.title}
            </button>
          ))}
        </div>
        <pre
          className="legal-text"
          tabIndex={0}
          aria-label={documents[selected].title}
          key={selected}
        >
          {documents[selected].text}
        </pre>
      </section>
    </div>
  )
}
