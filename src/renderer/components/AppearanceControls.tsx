import { t, localizeMessage } from '../../shared/i18n'
import { Palette, RotateCcw, Check } from 'lucide-react'
import { COLOR_PRESETS, DEFAULT_COLORS, type CustomColors } from '../../shared/appearance'
import type { Preferences } from '../../shared/studio'

export default function AppearanceControls({
  preferences,
  update
}: {
  preferences: Preferences
  update: (value: Preferences) => void
}) {
  const colors = preferences.customColors
  const apply = (value: CustomColors) => update({ ...preferences, customColors: value })
  return (
    <section className="feature-card full-width appearance-card">
      <div className="appearance-heading">
        <div>
          <h2>
            <Palette size={20} />
            {t('Colores de tu espacio')}
          </h2>
          <p>
            {t(
              'Elige una paleta o combina tus propios colores. El texto ajusta su contraste automáticamente.'
            )}
          </p>
        </div>
        <button className="secondary-button" onClick={() => apply({ ...DEFAULT_COLORS })}>
          <RotateCcw size={14} />
          {t('Restablecer colores')}
        </button>
      </div>
      <div className="palette-grid">
        {COLOR_PRESETS.map((preset) => {
          const selected =
            colors.enabled &&
            colors.background === preset.background &&
            colors.sidebar === preset.sidebar &&
            colors.panel === preset.panel &&
            colors.player === preset.player &&
            colors.accent === preset.accent
          return (
            <button
              key={localizeMessage(preset.name)}
              className={`palette-option ${selected ? 'selected' : ''}`}
              aria-label={t('Aplicar paleta {0}', localizeMessage(preset.name))}
              aria-pressed={selected}
              onClick={() => apply({ ...preset, enabled: true })}
            >
              <span className="palette-swatches" aria-hidden="true">
                {[preset.background, preset.panel, preset.sidebar, preset.accent].map(
                  (color, index) => (
                    <i style={{ background: color }} key={index} />
                  )
                )}
              </span>
              <span>
                {preset.name}
                {selected && <Check size={13} />}
              </span>
            </button>
          )
        })}
      </div>
      <label className="custom-color-toggle">
        <input
          type="checkbox"
          checked={colors.enabled}
          onChange={(event) => apply({ ...colors, enabled: event.target.checked })}
        />
        {t('Usar colores personalizados')}
      </label>
      <div className="color-settings">
        {(
          [
            ['background', t('Fondo principal')],
            ['sidebar', t('Barra lateral')],
            ['panel', t('Paneles y editor')],
            ['player', t('Reproductor')],
            ['accent', t('Botones y acento')]
          ] as const
        ).map(([key, label]) => (
          <label className="color-setting" key={key}>
            <span>{label}</span>
            <span className="color-value">
              <input
                type="color"
                aria-label={t('Color de {0}', label.toLocaleLowerCase())}
                value={colors[key]}
                onChange={(event) => apply({ ...colors, [key]: event.target.value, enabled: true })}
              />
              <code>{colors[key].toUpperCase()}</code>
            </span>
          </label>
        ))}
      </div>
      <p className="feature-note">
        {t(
          'Los cambios se ven al instante y quedan guardados en este equipo. Desactiva los colores personalizados para volver al tema claro u oscuro.'
        )}
      </p>
    </section>
  )
}
