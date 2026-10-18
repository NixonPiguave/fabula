import { deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'

// Code-native brand artwork; build PNG/ICO with no graphics dependencies.
const crcTable = Array.from({ length: 256 }, (_, i) => {
  for (let bit = 0; bit < 8; bit++) i = i & 1 ? 0xedb88320 ^ (i >>> 1) : i >>> 1
  return i >>> 0
})
function chunk(name, data) {
  const type = Buffer.from(name),
    all = Buffer.concat([type, data])
  let crc = 0xffffffff
  for (const byte of all) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
  const output = Buffer.alloc(data.length + 12)
  output.writeUInt32BE(data.length, 0)
  all.copy(output, 4)
  output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, data.length + 8)
  return output
}
function rounded(x, y, left, top, width, height, radius) {
  const dx = Math.max(left + radius - x, 0, x - (left + width - radius))
  const dy = Math.max(top + radius - y, 0, y - (top + height - radius))
  return (
    x >= left &&
    x <= left + width &&
    y >= top &&
    y <= top + height &&
    dx * dx + dy * dy <= radius * radius
  )
}
const heights = [34, 74, 122, 166, 108, 54]
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let alpha = 0,
        red = 0,
        green = 0,
        blue = 0
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const px = ((x + (sx + 0.5) / 4) * 256) / size,
            py = ((y + (sy + 0.5) / 4) * 256) / size
          if (!rounded(px, py, 3, 3, 250, 250, 56)) continue
          const bar = heights.some((height, i) =>
            rounded(px, py, 51 + i * 27, (256 - height) / 2, 13, height, 6.5)
          )
          alpha++
          red += bar ? 168 : 24 + 9 * (1 - py / 256)
          green += bar ? 237 : 49 + 13 * (1 - py / 256)
          blue += bar ? 193 : 34 + 8 * (1 - py / 256)
        }
      const offset = y * (size * 4 + 1) + 1 + x * 4
      raw[offset] = alpha ? Math.round(red / alpha) : 0
      raw[offset + 1] = alpha ? Math.round(green / alpha) : 0
      raw[offset + 2] = alpha ? Math.round(blue / alpha) : 0
      raw[offset + 3] = Math.round((alpha * 255) / 16)
    }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}
await mkdir('assets', { recursive: true })
const sizes = [16, 32, 48, 64, 128, 256],
  images = sizes.map(png)
const directory = Buffer.alloc(6 + 16 * sizes.length)
directory.writeUInt16LE(1, 2)
directory.writeUInt16LE(sizes.length, 4)
let offset = directory.length
sizes.forEach((size, i) => {
  const pos = 6 + i * 16
  directory[pos] = size % 256
  directory[pos + 1] = size % 256
  directory.writeUInt16LE(1, pos + 4)
  directory.writeUInt16LE(32, pos + 6)
  directory.writeUInt32LE(images[i].length, pos + 8)
  directory.writeUInt32LE(offset, pos + 12)
  offset += images[i].length
})
await writeFile('assets/icon.ico', Buffer.concat([directory, ...images]))
await writeFile('assets/icon.png', images.at(-1))
await writeFile(
  'assets/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect x="3" y="3" width="250" height="250" rx="56" fill="#203c2b"/>${heights.map((height, i) => `<rect x="${51 + i * 27}" y="${(256 - height) / 2}" width="13" height="${height}" rx="6.5" fill="#a8edc1"/>`).join('')}</svg>`
)
console.log('Created Fábula SVG, PNG and multi-resolution Windows icon.')
