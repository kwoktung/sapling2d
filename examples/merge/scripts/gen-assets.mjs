// 生成合成大西瓜的素材：11 级水果贴图（PNG，2 倍分辨率）和音效（mp3，ffmpeg 合成）。
// 运行：node scripts/gen-assets.mjs（生成的文件已提交，平时不需要再跑）
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

/** 与 src/config.ts 的 FRUITS 保持一致：半径（设计像素）和颜色 */
const FRUITS = [
  { r: 26, color: [220, 30, 60] }, // 樱桃
  { r: 36, color: [235, 60, 70] }, // 草莓
  { r: 46, color: [140, 70, 200] }, // 葡萄
  { r: 56, color: [255, 170, 40] }, // 橘子
  { r: 68, color: [255, 120, 30] }, // 橙子
  { r: 80, color: [200, 30, 40] }, // 苹果
  { r: 92, color: [235, 215, 80] }, // 梨
  { r: 106, color: [255, 150, 170] }, // 桃子
  { r: 120, color: [250, 200, 50] }, // 菠萝
  { r: 136, color: [150, 210, 90] }, // 哈密瓜
  { r: 152, color: [60, 160, 70] }, // 西瓜
]

function crc32(buf) {
  let crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5)
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))

FRUITS.forEach(({ r, color }, level) => {
  const size = r * 4 // 2 倍分辨率：直径 × 2
  const R = size / 2
  const data = png(size, (x, y) => {
    const d = Math.hypot(x - R, y - R)
    const alpha = Math.max(0, Math.min(1, R - d)) // 抗锯齿边缘
    const rim = Math.max(0, (d - R * 0.82) / (R * 0.18)) // 边缘变暗
    const hl = Math.max(0, 1 - Math.hypot(x - R * 0.68, y - R * 0.62) / (R * 0.55)) // 左上高光
    const k = 1 - rim * 0.35
    return [clamp(color[0] * k + hl * 120), clamp(color[1] * k + hl * 120), clamp(color[2] * k + hl * 120), Math.round(alpha * 255)]
  })
  writeFileSync(`public/assets/fruits/${level}.png`, data)
})

// 界面用的纯色块（引擎还没有画矩形的节点）：警戒线（虚线）、地面、墙
mkdirSync('public/assets/ui', { recursive: true })
const rectPng = (w, h, pixel) => {
  // 只支持正方形 png()：生成 w×h 需要单独实现
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y)
      const o = y * (w * 4 + 1) + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
writeFileSync('public/assets/ui/line.png', rectPng(750, 6, (x) => (Math.floor(x / 20) % 2 === 0 ? [255, 90, 90, 220] : [0, 0, 0, 0])))
writeFileSync('public/assets/ui/floor.png', rectPng(750, 140, (_x, y) => (y < 8 ? [190, 140, 90, 255] : [150, 105, 65, 255])))
writeFileSync('public/assets/ui/wall.png', rectPng(20, 1334, () => [90, 70, 55, 255]))

const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args])
const tone = (out, filter, dur) => ff(['-f', 'lavfi', '-i', `aevalsrc=${filter}:s=44100:d=${dur}`, '-ac', '1', '-b:a', '64k', out])
// 投放：短促的低音
tone('public/assets/sfx/drop.mp3', "'0.5*sin(2*PI*(180-200*t)*t)*exp(-25*t)'", 0.15)
// 合成：上扬的“啵”
tone('public/assets/sfx/merge.mp3', "'0.5*sin(2*PI*(500+900*t)*t)*exp(-14*t)'", 0.25)
// 合成出大西瓜 / 西瓜消除：三连音
tone('public/assets/sfx/big.mp3', "'0.4*(sin(2*PI*523*t)*lt(t,0.12)+sin(2*PI*659*t)*between(t,0.12,0.24)+sin(2*PI*784*t)*gte(t,0.24))*exp(-3*mod(t,0.12))'", 0.5)
// 游戏结束：下行
tone('public/assets/sfx/gameover.mp3', "'0.45*sin(2*PI*(440-260*t)*t)*exp(-2*t)'", 0.9)
// BGM：简单的循环旋律（C 大调琶音），8 秒
tone(
  'public/assets/bgm.mp3',
  "'0.12*sin(2*PI*(262*eq(mod(floor(t*4),8),0)+330*eq(mod(floor(t*4),8),1)+392*eq(mod(floor(t*4),8),2)+523*eq(mod(floor(t*4),8),3)+392*eq(mod(floor(t*4),8),4)+330*eq(mod(floor(t*4),8),5)+294*eq(mod(floor(t*4),8),6)+349*eq(mod(floor(t*4),8),7))*t)*(1-0.6*mod(t*4,1))'",
  8,
)
console.log('assets generated')
