// 生成骨架阶段的占位图：node scripts/gen-placeholders.mjs（美术到位后由 scripts/art/ 的管线替换）
// - 火花、光晕、路线虚线的点、射程圈；墓碑（等美术管线的 `tombstone` 生成出来再换）
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

// 墓碑：圆顶的灰色石碑 + 十字，底边在图的底部（锚点在脚底：游戏里 offset 往上挪半个高度）
const tomb = canvas(48, 64)
ellipse(tomb, 0, 24, 22, 20, 20, 0x9aa0a6, 0x2a2e33, 3)
rect(tomb, 0, 4, 22, 40, 38, 0x2a2e33)
rect(tomb, 0, 7, 22, 34, 35, 0x9aa0a6)
rect(tomb, 0, 22, 14, 4, 26, 0x5a6066)
rect(tomb, 0, 15, 20, 18, 4, 0x5a6066)
rect(tomb, 0, 0, 58, 48, 6, 0x4a7a3a)
save('tombstone.png', tomb)

save('glow.png', softCircle(64, 0.3))
save('spark.png', softCircle(12, 0.4))
save('dot.png', softCircle(14, 0.6))
save('range.png', ring(256, 4, 160))

console.log('placeholders written to public/assets/')
