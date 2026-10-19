import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from '@babel/parser'
import { english, type MessageKey } from '../src/shared/i18n/catalogue'
import {
  initialLanguage,
  normalizeLanguage,
  setLanguage,
  getLanguage,
  subscribeLanguage,
  t,
  translate,
  localizeMessage,
  formatNumber
} from '../src/shared/i18n'
import { preferencesSchema, chaptersOf, paragraphsOf } from '../src/shared/studio'
import { localizeVoice } from '../src/shared/voice-catalogue'
import { VOICES } from '../src/shared/types'

afterEach(() => setLanguage('es'))
describe('complete interface localization', () => {
  it('covers every source message and preserves every interpolation slot', () => {
    expect(Object.keys(english).length).toBeGreaterThan(600)
    for (const [source, translation] of Object.entries(english)) {
      expect(translation.trim(), source).not.toBe('')
      const slots = (value: string) =>
        [...value.matchAll(/\{\d+\}/g)].map((match) => match[0]).sort()
      expect(slots(translation), source).toEqual(slots(source))
      expect(translate('es', source as MessageKey), source).toBe(source)
    }
  })
  it('uses installer and system defaults only for new profiles', () => {
    expect(initialLanguage(undefined, 'en', 'es-EC')).toBe('en')
    expect(initialLanguage(undefined, 'es', 'en-US')).toBe('es')
    expect(initialLanguage(undefined, undefined, 'en_GB')).toBe('en')
    expect(initialLanguage(undefined, 'invalid', 'fr-FR')).toBe('es')
    expect(initialLanguage({ language: 'es' }, 'en', 'en-US')).toBe('es')
    expect(initialLanguage({ profiles: [] }, 'en', 'en-US')).toBe('es')
    expect(preferencesSchema.parse({}).language).toBe('es')
    expect(preferencesSchema.parse({ language: 'en' }).language).toBe('en')
    expect(preferencesSchema.safeParse({ language: 'fr' }).success).toBe(false)
    expect(normalizeLanguage({ language: 'en' })).toBeUndefined()
  })
  it('notifies React only on actual changes and formats numeric values by locale', () => {
    let updates = 0
    const unsubscribe = subscribeLanguage(() => updates++)
    setLanguage('en')
    setLanguage('en')
    expect(updates).toBe(1)
    expect(getLanguage()).toBe('en')
    expect(t('Voz a texto')).toBe('Speech to text')
    expect(formatNumber(1.25)).toBe('1.25')
    setLanguage('es')
    expect(formatNumber(1.25)).toBe('1,25')
    unsubscribe()
    setLanguage('en')
    expect(updates).toBe(2)
  })
  it('localizes saved messages in either direction without changing interpolation values', () => {
    setLanguage('en')
    expect(localizeMessage('MP3 guardado en C:\\Libros\\Mi novela.mp3')).toBe(
      'MP3 saved to C:\\Libros\\Mi novela.mp3'
    )
    expect(t('Editar perfil {0}', 'Mi lectura {0}')).toBe('Edit profile Mi lectura {0}')
    setLanguage('es')
    expect(localizeMessage('MP3 saved to C:\\Libros\\Mi novela.mp3')).toBe(
      'MP3 guardado en C:\\Libros\\Mi novela.mp3'
    )
    expect(localizeMessage('ECONNRESET')).toBe('ECONNRESET')
  })
  it('keeps voice identifiers, imported names and manuscript headings intact', () => {
    setLanguage('en')
    const voice = localizeVoice(VOICES[0])
    expect(voice.name).toBe(VOICES[0].name)
    expect(voice.id).toBe(VOICES[0].id)
    expect(voice.country).toBe('Mexico')
    const text = 'Capítulo 1: Mi novela\n\nMi historia en español.'
    const paragraphs = paragraphsOf(text)
    expect(chaptersOf(text)[0].title).toBe('Capítulo 1: Mi novela')
    expect(chaptersOf('A paragraph.')[0].title).toBe('Full story')
    expect(chaptersOf('Chapter 1\n\nText\n\nEpilogue\n\nEnd.')).toHaveLength(2)
    setLanguage('es')
    expect(paragraphsOf(text)).toEqual(paragraphs)
  })
  it('rejects untranslated JSX and accessibility labels in every renderer component', () => {
    const root = resolve('src/renderer')
    const allowed = new Set([
      'Fábula',
      'fábula',
      'T',
      'Hz',
      'px',
      's',
      '~15 s',
      'OCR',
      'PDF, EPUB, WORD',
      '.onnx',
      '.onnx.json',
      'Dr.',
      'Español',
      'English'
    ])
    const failures: string[] = []
    for (const file of readdirSync(root, { recursive: true }).filter((file) =>
      /\.tsx$/.test(file as string)
    ) as string[]) {
      const ast = parse(readFileSync(resolve(root, file), 'utf8'), {
        sourceType: 'module',
        plugins: ['typescript', 'jsx']
      })
      function visit(node: any) {
        if (!node || typeof node !== 'object') return
        const value =
          node.type === 'JSXText'
            ? node.value.replace(/\s+/g, ' ').trim()
            : node.type === 'JSXAttribute' &&
                ['aria-label', 'title', 'placeholder', 'alt'].includes(node.name?.name) &&
                node.value?.type === 'StringLiteral'
              ? node.value.value
              : ''
        if (/[a-záéíóúñ]/i.test(value) && !allowed.has(value))
          failures.push(`${file}:${node.loc?.start.line}: ${value}`)
        for (const [key, value] of Object.entries(node)) {
          if (['loc', 'comments', 'extra'].includes(key)) continue
          if (Array.isArray(value)) value.forEach(visit)
          else if (value && typeof value === 'object') visit(value)
        }
      }
      visit(ast)
    }
    expect(failures).toEqual([])
  })
})
