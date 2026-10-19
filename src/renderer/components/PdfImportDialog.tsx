import { t, getLanguage } from '../../shared/i18n'
import { useMemo, useRef, useState } from 'react'
import { X, FileText, Check, RotateCcw } from 'lucide-react'
import type { ImportResult } from '../../shared/types'
import { DEFAULT_PDF_OPTIONS, pdfText, type PdfOptions } from '../../shared/pdf'
import { useDialogFocus } from '../hooks/useDialogFocus'

export function PdfControls({
  value,
  change
}: {
  value: PdfOptions
  change: (value: PdfOptions) => void
}) {
  return (
    <div className="pdf-controls">
      <label>
        <input
          type="checkbox"
          checked={value.includeHeader}
          onChange={(event) => change({ ...value, includeHeader: event.target.checked })}
        />
        {t('Incluir encabezados')}
      </label>
      <label className="pdf-margin-range">
        {t('Margen superior')} <strong>{value.topPercent} %</strong>
        <input
          aria-label={t('Margen superior del PDF')}
          type="range"
          min="0"
          max="25"
          step="1"
          value={value.topPercent}
          disabled={value.includeHeader}
          onChange={(event) => change({ ...value, topPercent: +event.target.value })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.includeFooter}
          onChange={(event) => change({ ...value, includeFooter: event.target.checked })}
        />
        {t('Incluir pies de página')}
      </label>
      <label className="pdf-margin-range">
        {t('Margen inferior')} <strong>{value.bottomPercent} %</strong>
        <input
          aria-label={t('Margen inferior del PDF')}
          type="range"
          min="0"
          max="25"
          step="1"
          value={value.bottomPercent}
          disabled={value.includeFooter}
          onChange={(event) => change({ ...value, bottomPercent: +event.target.value })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.removePageNumbers}
          onChange={(event) => change({ ...value, removePageNumbers: event.target.checked })}
        />
        {t('Quitar números de página en los márgenes')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.removeRepeatedMargins}
          onChange={(event) => change({ ...value, removeRepeatedMargins: event.target.checked })}
        />
        {t('Detectar encabezados y pies repetidos')}
      </label>
      <button className="text-button" onClick={() => change({ ...DEFAULT_PDF_OPTIONS })}>
        <RotateCcw size={12} />
        {t('Restablecer opciones PDF')}
      </button>
    </div>
  )
}
export default function PdfImportDialog({
  result,
  options,
  close,
  apply
}: {
  result: ImportResult
  options: PdfOptions
  close: () => void
  apply: (text: string, options: PdfOptions) => void
}) {
  const ref = useRef<HTMLElement>(null)
  useDialogFocus(ref, close)
  const [settings, setSettings] = useState(options),
    [pageIndex, setPageIndex] = useState(0)
  const document = result.pdf!
  const processed = useMemo(() => pdfText(document, settings), [document, settings])
  const page = document.pages[pageIndex]
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        ref={ref}
        className="feature-modal pdf-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-import-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="feature-modal-heading">
          <div>
            <span className="eyebrow">{t('PREPARA LA LECTURA')}</span>
            <h2 id="pdf-import-title">
              <FileText size={21} />
              {t('Importar PDF sin distracciones')}
            </h2>
          </div>
          <button className="icon-button" aria-label={t('Cerrar vista previa PDF')} onClick={close}>
            <X size={19} />
          </button>
        </div>
        <p className="pdf-intro">
          {result.title} · {document.pages.length}{' '}
          {t(
            'páginas. Ajusta las franjas que quieres excluir y revisa el texto antes de llevarlo al editor.'
          )}
        </p>
        <div className="pdf-import-layout">
          <aside>
            <PdfControls value={settings} change={setSettings} />
            <p className="feature-note">
              {t(
                'Las franjas rojas se excluyen. La detección de repetidos solo afecta los márgenes; el texto original se mantiene hasta que pulses Aplicar.'
              )}
            </p>
          </aside>
          <div className="pdf-preview-area">
            <label className="pdf-page-select">
              {t('Vista previa de la página')}
              <input
                type="number"
                min="1"
                max={document.pages.length}
                aria-label={t('Página de vista previa PDF')}
                value={pageIndex + 1}
                onChange={(event) =>
                  setPageIndex(
                    Math.max(0, Math.min(document.pages.length - 1, (+event.target.value || 1) - 1))
                  )
                }
              />
            </label>
            <div className="pdf-page-preview">
              <svg
                viewBox="0 0 300 400"
                role="img"
                aria-label={t('Distribución del texto y márgenes excluidos')}
              >
                <rect width="300" height="400" fill="#fff" />
                {page.lines.slice(0, 400).map((line, index) => (
                  <text
                    key={index}
                    x={line.x * 300}
                    y={(line.y + line.height) * 400}
                    fontSize={Math.max(2, Math.min(line.height * 360, 9))}
                    fill="#18201b"
                  >
                    {line.text}
                  </text>
                ))}
                {!settings.includeHeader && (
                  <rect width="300" height={settings.topPercent * 4} fill="#e66d6d" opacity=".3" />
                )}
                {!settings.includeFooter && (
                  <rect
                    width="300"
                    y={400 - settings.bottomPercent * 4}
                    height={settings.bottomPercent * 4}
                    fill="#e66d6d"
                    opacity=".3"
                  />
                )}
              </svg>
            </div>
          </div>
          <div className="pdf-text-preview">
            <h3>
              {t('Texto que se importará · página')} {pageIndex + 1}
            </h3>
            <pre>
              {processed.pageTexts[pageIndex] ||
                t('Esta página no conserva texto con los ajustes actuales.')}
            </pre>
          </div>
        </div>
        <div className="pdf-import-footer">
          <span>
            {processed.excluded} {t('líneas excluidas en el documento ·')}{' '}
            {processed.text.length.toLocaleString(getLanguage())} {t('caracteres conservados')}
          </span>
          <div className="button-row">
            <button className="secondary-button" onClick={close}>
              {t('Cancelar')}
            </button>
            <button
              className="primary-button"
              disabled={!processed.text.trim()}
              onClick={() => apply(processed.text, settings)}
            >
              <Check size={15} />
              {t('Aplicar e importar texto')}
            </button>
          </div>
        </div>
        {!processed.text.trim() && (
          <p className="form-error">
            {t('No queda texto. Reduce los márgenes o incluye encabezados y pies.')}
          </p>
        )}
      </section>
    </div>
  )
}
