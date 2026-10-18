export const colorSchemaPattern = /^#[0-9a-f]{6}$/i
export type CustomColors = {
  enabled: boolean
  background: string
  sidebar: string
  panel: string
  player: string
  accent: string
}
export const DEFAULT_COLORS: CustomColors = {
  enabled: false,
  background: '#0f1210',
  sidebar: '#101311',
  panel: '#151917',
  player: '#121b15',
  accent: '#a1ecc3'
}
export const COLOR_PRESETS = [
  {
    name: 'Bosque',
    background: '#0f1210',
    sidebar: '#101311',
    panel: '#151917',
    player: '#121b15',
    accent: '#a1ecc3'
  },
  {
    name: 'Medianoche',
    background: '#101521',
    sidebar: '#0b101b',
    panel: '#1a2333',
    player: '#0d1422',
    accent: '#9dcaff'
  },
  {
    name: 'Ciruela',
    background: '#1c1424',
    sidebar: '#160f1d',
    panel: '#2a2035',
    player: '#1b1125',
    accent: '#d8b4f5'
  },
  {
    name: 'Café',
    background: '#211b17',
    sidebar: '#191410',
    panel: '#30271f',
    player: '#201711',
    accent: '#f2c49a'
  },
  {
    name: 'Papel',
    background: '#f5f1e8',
    sidebar: '#e9e2d4',
    panel: '#fffdf7',
    player: '#ece4d6',
    accent: '#587149'
  },
  {
    name: 'Brisa',
    background: '#edf4fa',
    sidebar: '#dfeaf3',
    panel: '#ffffff',
    player: '#d9e8f2',
    accent: '#286e9c'
  }
] as const
function rgb(hex: string) {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16))
}
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((value) => {
    const s = value / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrastRatio(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
export function readableText(background: string) {
  const preferred =
    contrastRatio(background, '#ffffff') >= contrastRatio(background, '#172019')
      ? '#ffffff'
      : '#172019'
  return contrastRatio(background, preferred) >= 4.5 ? preferred : '#000000'
}
export function mix(a: string, b: string, amount: number) {
  const other = rgb(b)
  return (
    '#' +
    rgb(a)
      .map((value, index) =>
        Math.round(value * (1 - amount) + other[index] * amount)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}
export function appearanceVariables(colors: CustomColors): Record<string, string> {
  if (!colors.enabled) return {}
  const result: Record<string, string> = {
    '--mint': colors.accent,
    '--custom-accent': colors.accent,
    '--button-ink': readableText(colors.accent)
  }
  for (const region of ['background', 'sidebar', 'panel', 'player'] as const) {
    const bg = colors[region],
      fg = readableText(bg)
    result[`--custom-${region}`] = bg
    result[`--${region}-text`] = fg
    let muted = fg
    for (const amount of [0.65, 0.75, 0.85, 1]) {
      muted = mix(bg, fg, amount)
      if (contrastRatio(bg, muted) >= 4.5) break
    }
    result[`--${region}-muted`] = muted
    result[`--${region}-line`] = mix(bg, fg, 0.25)
    result[`--${region}-hover`] = mix(bg, fg, 0.1)
    result[`--${region}-accent`] = contrastRatio(bg, colors.accent) >= 4.5 ? colors.accent : fg
  }
  return result
}
