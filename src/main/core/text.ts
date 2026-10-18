import { createHash } from 'node:crypto'
import type { VoiceSettings } from '../../shared/types'

export function escapeXml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!
  )
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Bound escaped SSML bytes, not JS characters; preserve every normalized character. */
export function splitText(input: string, maxBytes = 2400): string[] {
  if (!Number.isInteger(maxBytes) || maxBytes < 12) throw new Error('Invalid chunk budget')
  const chunks: string[] = []
  let buffer = '',
    bytes = 0,
    boundary = 0
  for (const point of normalizeText(input)) {
    const cost = Buffer.byteLength(escapeXml(point), 'utf8')
    while (bytes + cost > maxBytes) {
      const splitAt = boundary > buffer.length / 3 ? boundary : buffer.length
      chunks.push(buffer.slice(0, splitAt))
      buffer = buffer.slice(splitAt)
      bytes = Buffer.byteLength(escapeXml(buffer), 'utf8')
      boundary = 0
    }
    buffer += point
    bytes += cost
    if (/\s/u.test(point)) boundary = buffer.length
  }
  if (buffer) chunks.push(buffer)
  return chunks
}

export function audioFingerprint(text: string, settings: VoiceSettings): string {
  return createHash('sha256')
    .update(JSON.stringify({ text: normalizeText(text), ...settings, version: 1 }))
    .digest('hex')
}
