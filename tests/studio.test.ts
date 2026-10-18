import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { chaptersOf, paragraphsOf, cleanText, preferencesSchema } from '../src/shared/studio'
import { pronounce, narrationPlan } from '../src/main/core/plan'
import { DEFAULT_SETTINGS, type JobRecord } from '../src/shared/types'
import { safeName } from '../src/main/core/files'

function job(text: string): JobRecord {
  return {
    id: randomUUID(),
    title: 'Libro',
    text,
    settings: DEFAULT_SETTINGS,
    chunkVersion: 2,
    status: 'generating',
    preview: false,
    characters: text.length,
    words: 1,
    totalChunks: 0,
    completedChunks: 0,
    createdAt: new Date().toISOString()
  }
}
describe('story structure and safe regeneration', () => {
  it('detects prologue, numbered chapters, Roman parts and epilogue with source ranges', () => {
    const text =
      'Prólogo\n\nInicio.\n\nCapítulo 1: La llegada\n\nHistoria.\n\nParte II\n\nMás.\n\nEpílogo\n\nFin.'
    const chapters = chaptersOf(text)
    expect(chapters.map((chapter) => chapter.title)).toEqual([
      'Prólogo',
      'Capítulo 1: La llegada',
      'Parte II',
      'Epílogo'
    ])
    expect(chapters.map((chapter) => text.slice(chapter.start, chapter.end)).join('')).toBe(text)
  })
  it('retains a preface and handles a book with no headings', () => {
    expect(chaptersOf('Introducción libre\n\nCapítulo 1\nTexto.')[0].title).toBe('Introducción')
    expect(chaptersOf('Una historia.')[0].title).toBe('Historia completa')
  })
  it('keeps paragraph identities when inserting another paragraph', () => {
    const before = paragraphsOf('Uno.\n\nDos.\n\nUno.')
    const after = paragraphsOf('Nuevo.\n\nUno.\n\nDos.\n\nUno.')
    expect(before.map((entry) => entry.id)).toEqual(after.slice(1).map((entry) => entry.id))
    expect(new Set(before.map((entry) => entry.id)).size).toBe(3)
  })
  it('reuses unchanged audio while invalidating changed text, voice and pronunciation', () => {
    const original = job('Primero.\n\nBeethoven llegó.')
    const initial = narrationPlan(original)
    const edited = narrationPlan({ ...original, text: 'Primero.\n\nBeethoven volvió.' })
    expect(initial.units[0].key).toBe(edited.units[0].key)
    expect(initial.units[1].key).not.toBe(edited.units[1].key)
    const block = paragraphsOf(original.text)[1]
    expect(
      narrationPlan({ ...original, blockOverrides: { [block.id]: { voice: 'es-MX-DaliaNeural' } } })
        .units[1].key
    ).not.toBe(initial.units[1].key)
    const dictionary = [{ id: randomUUID(), written: 'Beethoven', spoken: 'Betoven' }]
    expect(narrationPlan({ ...original, pronunciations: dictionary }).units[1].text).toBe(
      'Betoven llegó.'
    )
    expect(original.text).toBe('Primero.\n\nBeethoven llegó.')
  })
  it('never conflates chapters even without blank lines', () => {
    const plan = narrationPlan(job('Capítulo 1\nHola.\nCapítulo 2\nAdiós.'))
    expect(plan.chapters).toHaveLength(2)
    expect(plan.units.map((unit) => unit.chapter)).toEqual([0, 1])
    expect(plan.units[1].text).not.toContain('Hola')
  })
  it('changes pauses without re-requesting identical speech', () => {
    const story = job('El héroe volvió.')
    const a = narrationPlan({ ...story, pauseMs: 350 }).units[0]
    const b = narrationPlan({ ...story, pauseMs: 1500 }).units[0]
    expect(a.key).toBe(b.key)
    expect(a.pauseMs).not.toBe(b.pauseMs)
  })
})
describe('pronunciation and text cleanup', () => {
  it('matches whole names, escapes regex and does not recursively replace aliases', () => {
    const entries = [
      { id: randomUUID(), written: 'A+B', spoken: 'Beethoven' },
      { id: randomUUID(), written: 'Beethoven', spoken: 'Betoven' }
    ]
    expect(pronounce('A+B y BEETHOVEN; Beethovenson.', entries)).toBe(
      'Beethoven y Betoven; Beethovenson.'
    )
  })
  it('produces a reviewable cleanup without changing the input', () => {
    const text = 'Cabecera\n\nPágina 1\n\nUna pala-\nbra.\n\nCabecera\n\nPágina 2\n\nCabecera'
    const result = cleanText(text, { joinLines: true, pageNumbers: true, repeatedLines: true })
    expect(result.text).toBe('Una palabra.')
    expect(result.removed).toHaveLength(5)
    expect(text).toContain('Página 1')
  })
  it('validates preferences and prevents invalid Windows filenames', () => {
    expect(preferencesSchema.parse({}).theme).toBe('dark')
    expect(preferencesSchema.safeParse({ editorFontSize: 100 }).success).toBe(false)
    expect(safeName('CON')).toBe('_CON')
    expect(safeName('capítulo: 1 / final.')).toBe('capítulo_ 1 _ final')
  })
})
