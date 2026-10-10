// 生成骨架阶段的占位图：node scripts/gen-placeholders.mjs（美术到位后由 scripts/art/ 的管线替换）
// - 槽位、箭、火花、光晕、路线虚线的点、射程圈、刀光（英雄和怪物已经换成美术管线生成的图集）（英雄已经换成美术管线生成的图集）
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const OUT = new URL('../public/assets/', import.meta.url)
mkdirSync(OUT, { recursive: true })

// ---------------------------------------------------------------- PNG

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
function canvas(w, h) {
  return { w, h, px: Buffer.alloc(w * h * 4) }
}
function png(c) {
  const raw = Buffer.alloc((c.w * 4 + 1) * c.h)
  for (let y = 0; y < c.h; y++) c.px.copy(raw, y * (c.w * 4 + 1) + 1, y * c.w * 4, (y + 1) * c.w * 4)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(c.w, 0); ihdr.writeUInt32BE(c.h, 4)
  ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
function setPx(c, x, y, color, alpha = 255) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return
  const o = (y * c.w + x) * 4
  c.px[o] = (color >> 16) & 255; c.px[o + 1] = (color >> 8) & 255; c.px[o + 2] = color & 255; c.px[o + 3] = alpha
}
/** 椭圆（按像素中心判断），边缘一圈描边。`ox` 是整张图里的 x 偏移（画在横条的第几帧）。 */
function ellipse(c, ox, cx, cy, rx, ry, color, outline, width = 3) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry)
      if (d > 1) continue
      setPx(c, ox + x, y, d > 1 - width / Math.min(rx, ry) ? outline : color)
    }
  }
}
function rect(c, ox, x, y, w, h, color) {
  for (let j = Math.round(y); j < y + h; j++) for (let i = Math.round(x); i < x + w; i++) setPx(c, ox + i, j, color)
}
/** 中心亮、边缘透明的圆（白色，用 modulate 染色）。 */
function softCircle(size, hardness = 0) {
  const c = canvas(size, size)
  const r = size / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r
      if (d > 1) continue
      const a = d < hardness ? 1 : 1 - (d - hardness) / (1 - hardness)
      setPx(c, x, y, 0xffffff, Math.round(255 * a))
    }
  }
  return c
}
/** 圆环（白色）：半径 r 处宽 width 的一圈。 */
function ring(size, width, alpha = 255) {
  const c = canvas(size, size)
  const r = size / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r)
      if (d <= r && d > r - width) setPx(c, x, y, 0xffffff, alpha)
    }
  }
  return c
}
const save = (name, c) => writeFileSync(new URL(name, OUT), png(c))

// ---------------------------------------------------------------- 怪物和场地

const slot = canvas(110, 110)
ellipse(slot, 0, 55, 55, 52, 52, 0x3a4a3a, 0x6a806a, 5)
save('slot.png', slot)

const arrow = canvas(8, 36)
rect(arrow, 0, 3, 6, 2, 30, 0xe8d8b0)
for (let y = 0; y < 8; y++) rect(arrow, 0, 4 - y / 2, y, Math.max(1, y), 1, 0xffffff)
save('arrow.png', arrow)

save('glow.png', softCircle(64, 0.3))
save('spark.png', softCircle(12, 0.4))
save('dot.png', softCircle(14, 0.6))
save('range.png', ring(256, 4, 160))

// 刀光：上方 120° 的弧（白色，边缘淡出），圆心在图中心；游戏里叠加发光、染色、按射程缩放
const slash = canvas(200, 200)
for (let y = 0; y < 200; y++) {
  for (let x = 0; x < 200; x++) {
    const dx = x + 0.5 - 100, dy = y + 0.5 - 100
    const d = Math.hypot(dx, dy)
    const angle = Math.atan2(dx, -dy) // 0 = 正上方
    if (d > 98 || d < 60 || Math.abs(angle) > Math.PI / 3) continue
    const edge = Math.min(1, (98 - d) / 8, (d - 60) / 20, (Math.PI / 3 - Math.abs(angle)) / 0.3)
    setPx(slash, x, y, 0xffffff, Math.round(230 * edge))
  }
}
save('slash.png', slash)
console.log('placeholders written to public/assets/')
