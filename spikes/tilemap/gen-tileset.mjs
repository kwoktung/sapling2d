// 生成 spike 用的图块集：8 列 × 4 行，每格 16px。每格有深色描边和浅色高光，接缝处漏色一眼就能看出来。
// - tiles.png：图块紧挨着排列（128×64）
// - tiles-extruded.png：每格四周向外复制 1px（步长 18，144×72），用来对比“图块边缘漏色”
// node spikes/tilemap/gen-tileset.mjs
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const T = 16
const COLS = 8
const ROWS = 4

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/** 第 i 个图块在 (x, y) 处的颜色。 */
function tilePixel(i, x, y) {
  const hue = (i * 47) % 360
  const [r, g, b] = hsl(hue, 0.55, 0.45)
  const edge = x === 0 || y === 0 || x === T - 1 || y === T - 1
  if (edge) return [r * 0.45, g * 0.45, b * 0.45, 255]
  if ((x === 3 || x === 4) && (y === 3 || y === 4)) return [255, 255, 255, 255]
  if ((x + y) % 6 === 0) return [r * 1.25, g * 1.25, b * 1.25, 255]
  return [r, g, b, 255]
}
function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}

function sheet(pad) {
  const stride = T + pad * 2
  const w = COLS * stride
  const h = ROWS * stride
  const buf = Buffer.alloc(w * h * 4)
  for (let i = 0; i < COLS * ROWS; i++) {
    const ox = (i % COLS) * stride + pad
    const oy = Math.floor(i / COLS) * stride + pad
    for (let y = -pad; y < T + pad; y++) {
      for (let x = -pad; x < T + pad; x++) {
        const c = tilePixel(i, Math.min(T - 1, Math.max(0, x)), Math.min(T - 1, Math.max(0, y)))
        const o = ((oy + y) * w + ox + x) * 4
        for (let k = 0; k < 4; k++) buf[o + k] = Math.max(0, Math.min(255, Math.round(c[k])))
      }
    }
  }
  return png(w, h, buf)
}

const dir = new URL('public/assets/', import.meta.url)
writeFileSync(new URL('tiles.png', dir), sheet(0))
writeFileSync(new URL('tiles-extruded.png', dir), sheet(1))
console.log('tiles.png, tiles-extruded.png written')
