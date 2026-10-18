import { describe, it, expect } from 'vitest'
import { splitText, normalizeText, escapeXml, audioFingerprint } from '../src/main/core/text'
import { parseRange } from '../src/main/core/range'
import { startSchema, settingsSchema, idSchema } from '../src/shared/validation'
import { DEFAULT_SETTINGS } from '../src/shared/types'

describe('long-form narration chunking', () => {
  it('preserves a long Unicode story including dialogue and XML characters', () => {
    const input = (
      '—¿Qué ocurrió?\r\n\r\nLa niña dijo: "Dragón & héroe <3". 🐉\n' + '世界 '
    ).repeat(1600)
    const chunks = splitText(input)
    expect(chunks.length).toBeGreaterThan(50)
    expect(chunks.join('')).toBe(normalizeText(input))
    for (const part of chunks) expect(Buffer.byteLength(escapeXml(part))).toBeLessThanOrEqual(2400)
  })
  it('splits enormous unbroken words without truncation or broken surrogates', () => {
    const input = 'á🐉&<世界'.repeat(4000)
    const chunks = splitText(input)
    expect(chunks.join('')).toBe(input)
    for (const part of chunks) {
      expect(Buffer.byteLength(escapeXml(part))).toBeLessThanOrEqual(2400)
      expect(part).not.toMatch(/[\uD800-\uDBFF]$/u)
    }
  })
  it('handles adversarial mixtures at small budgets', () => {
    let seed = 53
    const points = ['a', ' ', '\n', '&', "'", '🐉', '界', '<']
    for (let iteration = 0; iteration < 100; iteration++) {
      let input = ''
      for (let i = 0; i < 250; i++) {
        seed = (seed * 16807) % 2147483647
        input += points[seed % points.length]
      }
      const chunks = splitText(input, 12 + iteration)
      expect(chunks.join('')).toBe(normalizeText(input))
      for (const part of chunks)
        expect(Buffer.byteLength(escapeXml(part))).toBeLessThanOrEqual(12 + iteration)
    }
  })
  it('rejects invalid budgets and accepts empty input', () => {
    expect(() => splitText('a', 5)).toThrow()
    expect(splitText(' \n\r\t')).toEqual([])
  })
  it('escapes text so it cannot inject SSML instructions', () => {
    expect(escapeXml('<voice name="other">a & b</voice>')).toBe(
      '&lt;voice name=&quot;other&quot;&gt;a &amp; b&lt;/voice&gt;'
    )
  })
  it('distinguishes changed voice settings when identifying audio', () => {
    expect(audioFingerprint('hola', DEFAULT_SETTINGS)).not.toBe(
      audioFingerprint('hola', { ...DEFAULT_SETTINGS, pitch: -15 })
    )
    expect(audioFingerprint('hola\r\nmundo', DEFAULT_SETTINGS)).toBe(
      audioFingerprint('hola\nmundo', DEFAULT_SETTINGS)
    )
  })
})

describe('audio range requests and seeking', () => {
  it('handles whole files, bounded ranges, open ranges and suffixes', () => {
    expect(parseRange(null, 1000)).toBeNull()
    expect(parseRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 })
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=-200', 1000)).toEqual({ start: 800, end: 999 })
    expect(parseRange('bytes=900-99999', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=-99999', 1000)).toEqual({ start: 0, end: 999 })
  })
  it('rejects malformed, unsatisfiable and multi-range requests', () => {
    for (const value of [
      'bytes=-',
      'bytes=-0',
      'bytes=10-2',
      'bytes=1000-',
      'bytes=1-2,3-4',
      'garbage',
      'bytes=999999999999999999-'
    ])
      expect(parseRange(value, 1000)).toBe('invalid')
    expect(parseRange('bytes=0-', 0)).toBe('invalid')
  })
})

describe('desktop IPC input validation', () => {
  it('rejects unsupported voices, out-of-bounds controls and path traversal IDs', () => {
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, voice: '<voice>' }).success).toBe(false)
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, speed: 100 }).success).toBe(false)
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, pitch: -200 }).success).toBe(false)
    expect(idSchema.safeParse('../../secret').success).toBe(false)
  })
  it('accepts large documents and rejects empty narration', () => {
    expect(
      startSchema.safeParse({
        title: 'Libro',
        settings: DEFAULT_SETTINGS,
        text: 'a'.repeat(1_000_000)
      }).success
    ).toBe(true)
    expect(
      startSchema.safeParse({ title: 'Libro', settings: DEFAULT_SETTINGS, text: ' \n ' }).success
    ).toBe(false)
  })
})
