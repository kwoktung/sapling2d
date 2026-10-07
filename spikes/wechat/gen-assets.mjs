// 生成 spike 用的资源：一张带透明通道的圆形 PNG，加两段 mp3（音效、BGM）
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'

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
function circlePng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const r = size / 2
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r)
      const a = Math.max(0, Math.min(1, r - d)) // 抗锯齿边缘
      const hl = Math.max(0, 1 - Math.hypot(x - r * 0.65, y - r * 0.65) / r) // 高光
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = Math.min(255, 255 * (0.95 + hl * 0.05))
      raw[o + 1] = Math.min(255, 120 + hl * 120)
      raw[o + 2] = Math.min(255, 30 + hl * 150)
      raw[o + 3] = Math.round(a * 255)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync('assets/fruit.png', circlePng(128))
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args])
ff(['-f', 'lavfi', '-i', 'sine=frequency=660:duration=0.15', '-af', 'afade=t=out:st=0.05:d=0.1', '-ar', '44100', '-ac', '1', '-b:a', '64k', 'assets/pop.mp3'])
ff(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=4',
  '-filter_complex', 'amix=inputs=2,volume=0.3', '-ar', '44100', '-ac', '1', '-b:a', '64k', 'assets/bgm.mp3'])
console.log('assets generated')
