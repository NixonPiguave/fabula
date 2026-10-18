import { createHash } from 'node:crypto'
import { chaptersOf, paragraphsOf, type Pronunciation } from '../../shared/studio'
import type { JobRecord, VoiceSettings } from '../../shared/types'
import { splitText } from './text'

export type Unit = {
  key: string
  text: string
  settings: VoiceSettings
  pauseMs: number
  chapter: number
  blockId: string
}
export function pronounce(text: string, entries: Pronunciation[]): string {
  if (!entries.length) return text
  const replacements = new Map(
    entries.map((entry) => [entry.written.toLocaleLowerCase('es'), entry.spoken])
  )
  const terms = [...replacements.keys()]
    .sort((a, b) => b.length - a.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${terms.join('|')})(?![\\p{L}\\p{N}_])`, 'giu')
  return text.replace(regex, (match) => replacements.get(match.toLocaleLowerCase('es'))!)
}
export function narrationPlan(job: JobRecord) {
  const chapters = chaptersOf(job.text),
    units: Unit[] = [],
    paragraphs = paragraphsOf(job.text)
  let firstParagraph = 0
  // Split at chapter boundaries first so a document without blank lines still exports correctly.
  for (let chapter = 0; chapter < chapters.length; chapter++) {
    const entry = chapters[chapter]
    while (paragraphs[firstParagraph] && paragraphs[firstParagraph].end <= entry.start)
      firstParagraph++
    for (let p = firstParagraph; p < paragraphs.length && paragraphs[p].start < entry.end; p++) {
      const paragraph = paragraphs[p]
      const start = Math.max(paragraph.start, entry.start),
        end = Math.min(paragraph.end, entry.end)
      if (start >= end) continue
      const override = job.blockOverrides?.[paragraph.id]
      const settings = { ...job.settings, voice: override?.voice ?? job.settings.voice }
      const parts = splitText(pronounce(job.text.slice(start, end), job.pronunciations ?? []))
      parts.forEach((text, index) => {
        const pauseMs = index === parts.length - 1 ? (override?.pauseMs ?? job.pauseMs ?? 350) : 0
        const engine = /^(?:piper|sapi32|sapi64):/.test(settings.voice) ? 'external-v1' : 'edge-v2'
        const key = createHash('sha256')
          .update(JSON.stringify({ engine, text, settings }))
          .digest('hex')
        units.push({ key, text, settings, pauseMs, chapter, blockId: paragraph.id })
      })
    }
  }
  return { chapters, units }
}
