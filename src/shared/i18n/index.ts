import { english, type MessageKey } from './catalogue'

export type Language = 'es' | 'en'
export const LANGUAGES = ['es', 'en'] as const
let language: Language = 'es'
const listeners = new Set<() => void>()
export function getLanguage(): Language {
  return language
}
export function setLanguage(value: Language) {
  if (value === language) return
  language = value
  for (const listener of listeners) listener()
}
export function subscribeLanguage(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function normalizeLanguage(value: unknown): Language | undefined {
  if (typeof value !== 'string') return
  const base = value.toLowerCase().split(/[-_]/)[0]
  return base === 'en' || base === 'es' ? base : undefined
}
/** Existing Spanish preferences keep their language; installer defaults only apply to new profiles. */
export function initialLanguage(saved: unknown, installer: unknown, system: unknown): Language {
  if (saved && typeof saved === 'object' && !Array.isArray(saved))
    return normalizeLanguage((saved as { language?: unknown }).language) ?? 'es'
  return normalizeLanguage(installer) ?? normalizeLanguage(system) ?? 'es'
}
export function translate(locale: Language, key: MessageKey, ...values: (string | number)[]) {
  const message = locale === 'en' ? english[key] : key
  return message.replace(/\{(\d+)\}/g, (token, index: string) => String(values[+index] ?? token))
}
export function t(key: MessageKey, ...values: (string | number)[]) {
  return translate(language, key, ...values)
}
export function formatNumber(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(language, options).format(value)
}
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const patterns = (Object.entries(english) as [MessageKey, string][]).flatMap(([key, en]) =>
  [key, en]
    .filter((value, index, all) => all.indexOf(value) === index)
    .map((value) => {
      const indices: number[] = []
      const parts = value.split(/(\{\d+\})/g).map((part) => {
        const match = /^\{(\d+)\}$/.exec(part)
        if (!match) return escapeRegExp(part)
        indices.push(+match[1])
        return '([\\s\\S]*?)'
      })
      return { key, indices, expression: new RegExp('^' + parts.join('') + '$') }
    })
)
/** Only for app-owned metadata and messages received from workers or saved job errors.
 * Never pass user text, project names or imported voice names through this function. */
export function localizeMessage(value: string): string {
  if (Object.hasOwn(english, value)) return t(value as MessageKey)
  for (const pattern of patterns) {
    const match = pattern.expression.exec(value)
    if (!match) continue
    const values: string[] = []
    pattern.indices.forEach((index, position) => {
      values[index] = match[position + 1]
    })
    return t(pattern.key, ...values)
  }
  return value
}

/** Stable localized explanations for third-party exceptions; raw engine diagnostics stay out of UI copy. */
export function userError(
  error: unknown,
  fallback: MessageKey = 'No se pudo completar la operación. Comprueba el archivo, la conexión y los permisos, e inténtalo de nuevo.'
) {
  const message = error instanceof Error ? error.message : String(error)
  return patterns.some((pattern) => pattern.expression.test(message))
    ? localizeMessage(message)
    : t(fallback)
}
