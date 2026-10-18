import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import privacy from '../../../PRIVACIDAD.txt?raw'
import notices from '../../../AVISOS_DE_USO.txt?raw'
import license from '../../../LICENSE.txt?raw'
import thirdParty from '../../../TERCEROS.txt?raw'
import componentLicenses from '../../../LICENCIAS_DE_COMPONENTES.txt?raw'
import { useDialogFocus } from '../hooks/useDialogFocus'

const documents = {
  privacy: { title: 'Privacidad', text: privacy },
  notices: { title: 'Avisos de uso', text: notices },
  license: { title: 'Licencia GPL', text: license },
  thirdParty: { title: 'Terceros', text: thirdParty + '\n\n' + componentLicenses }
}
export default function LegalDialog({ close }: { close: () => void }) {
  const [selected, setSelected] = useState<keyof typeof documents>('privacy')
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
        <button className="icon-button" aria-label="Cerrar documentos legales" onClick={close}>
          <X size={19} />
        </button>
        <h2 id="legal-title">Privacidad y licencias</h2>
        <p>Consulta qué datos se procesan y las condiciones del programa y sus componentes.</p>
        <div className="legal-tabs" aria-label="Documentos legales">
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
