import { z } from 'zod'
import type { VoiceSettings } from './types'
import { settingsSchema } from './validation'
import { DEFAULT_COLORS, colorSchemaPattern } from './appearance'
import { pdfOptionsSchema, DEFAULT_PDF_OPTIONS } from './pdf'

export const pronunciationSchema = z.object({
  id: z.uuid(),
  written: z.string().trim().min(1).max(120),
  spoken: z.string().trim().min(1).max(200)
})
export const preferencesSchema = z.object({
  pdfImport: pdfOptionsSchema.default(DEFAULT_PDF_OPTIONS),
  theme: z.enum(['dark', 'light']).default('dark'),
  accent: z.enum(['mint', 'violet', 'blue', 'rose', 'amber', 'teal']).default('mint'),
  customColors: z
    .object({
      enabled: z.boolean(),
      background: z.string().regex(colorSchemaPattern),
      sidebar: z.string().regex(colorSchemaPattern),
      panel: z.string().regex(colorSchemaPattern),
      player: z.string().regex(colorSchemaPattern),
      accent: z.string().regex(colorSchemaPattern)
    })
    .default(DEFAULT_COLORS),
  editorFontSize: z.number().int().min(12).max(24).default(15),
  editorWidth: z.enum(['comfortable', 'wide']).default('comfortable'),
  exportFolder: z.string().default(''),
  profiles: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(60),
        settings: settingsSchema,
        pauseMs: z.number().int().min(0).max(3000)
      })
    )
    .max(100)
    .default([]),
  pronunciations: z.array(pronunciationSchema).max(1000).default([])
})
export type Preferences = z.infer<typeof preferencesSchema>
export type Pronunciation = z.infer<typeof pronunciationSchema>
export const DEFAULT_PREFERENCES = preferencesSchema.parse({})
export type BlockOverride = { voice?: VoiceSettings['voice']; pauseMs?: number }
export type NarrationOptions = { pauseMs?: number; blockOverrides?: Record<string, BlockOverride> }
export type Paragraph = { id: string; text: string; start: number; end: number; chapter: number }
export type Chapter = { title: string; start: number; end: number }
export type AudioChapter = { title: string; file: string; startSeconds: number }
export type PlaybackState = {
  currentId: string | null
  positions: Record<string, number>
  bookmarks: Record<string, { id: string; label: string; seconds: number }[]>
}
export type ModuleKind = 'ocr' | 'transcription' | 'piper'
export type ModuleState = {
  kind: ModuleKind
  installed: boolean
  status: 'idle' | 'downloading' | 'verifying' | 'ready' | 'failed'
  progress: number
  error?: string
}
export type TaskProgress = {
  kind: 'import' | 'transcription'
  phase: string
  progress: number
  status: 'running' | 'completed' | 'cancelled' | 'failed'
  error?: string
}
export type TranscriptSegment = { start: number; end: number; text: string }
export type Transcript = {
  id: string
  title: string
  text: string
  segments: TranscriptSegment[]
  createdAt: string
}

/** Stable identity across insertion/reordering; duplicate text receives an occurrence suffix. */
function textId(text: string) {
  let first = 2166136261,
    second = 3335557771
  for (let i = 0; i < text.length; i++) {
    first = Math.imul(first ^ text.charCodeAt(i), 16777619)
    second = Math.imul(second ^ text.charCodeAt(i), 2246822507)
  }
  return (first >>> 0).toString(16).padStart(8, '0') + (second >>> 0).toString(16).padStart(8, '0')
}
export function chaptersOf(text: string): Chapter[] {
  const headings = [
    ...text.matchAll(
      /^(?:[ \t]*#{1,4}[ \t]+)?[ \t]*(?:(?:cap[ií]tulo|chapter|episodio|parte|volumen)\s+(?:\d+|[IVXLCDM]+)\b[^\n]*|(?:pr[oó]logo|ep[ií]logo)(?:\s*[:.\-—][^\n]*)?)[ \t]*$/gimu
    )
  ]
  if (!headings.length)
    return text.trim() ? [{ title: 'Historia completa', start: 0, end: text.length }] : []
  const chapters: Chapter[] = []
  if (text.slice(0, headings[0].index).trim())
    chapters.push({ title: 'Introducción', start: 0, end: headings[0].index! })
  headings.forEach((heading, index) =>
    chapters.push({
      title: heading[0].trim().replace(/^#+\s*/, ''),
      start: heading.index!,
      end: headings[index + 1]?.index ?? text.length
    })
  )
  return chapters
}
export function paragraphsOf(text: string): Paragraph[] {
  const chapters = chaptersOf(text),
    counts = new Map<string, number>()
  return [...text.matchAll(/\S[^]*?(?=\n\s*\n|$)/g)].map((match) => {
    const content = match[0].trimEnd(),
      key = textId(content),
      occurrence = counts.get(key) ?? 0
    counts.set(key, occurrence + 1)
    const start = match.index!
    return {
      id: `${key}-${occurrence}`,
      text: content,
      start,
      end: start + content.length,
      chapter: Math.max(
        0,
        chapters.findIndex((chapter) => start >= chapter.start && start < chapter.end)
      )
    }
  })
}
export function cleanText(
  text: string,
  options: { joinLines: boolean; pageNumbers: boolean; repeatedLines: boolean }
) {
  let result = text.replace(/\r\n?/g, '\n')
  const lines = result.split('\n'),
    frequency = new Map<string, number>()
  for (const line of lines) {
    const key = line.trim()
    if (key && key.length <= 100) frequency.set(key, (frequency.get(key) ?? 0) + 1)
  }
  const removed: string[] = []
  result = lines
    .filter((line) => {
      const key = line.trim()
      const remove =
        (options.pageNumbers &&
          /^(?:(?:p[aá]gina|page)\s*)?\d+(?:\s*(?:de|of|\/)\s*\d+)?$/i.test(key)) ||
        (options.repeatedLines && key.length > 3 && (frequency.get(key) ?? 0) >= 3)
      if (remove) removed.push(line)
      return !remove
    })
    .join('\n')
  if (options.joinLines)
    result = result.replace(/(\p{L})-\n(?=\p{Ll})/gu, '$1').replace(/([^\n])\n(?=[^\n])/g, '$1 ')
  return { text: result.replace(/\n{3,}/g, '\n\n').trim(), removed }
}
