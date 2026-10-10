// 生成骨架阶段的占位图：node scripts/gen-placeholders.mjs（美术到位后由 scripts/art/ 的管线替换）
// - 英雄：身体（圆 + 眼睛，不拿武器）和武器分开两张图；怪物、槽位、箭、火花、光晕、路线虚线的点、射程圈
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

// ---------------------------------------------------------------- 英雄（身体 + 武器）

const BODY = 96
/** 身体：Q 版的大圆头 + 小身子，脚底在图的下边缘附近（游戏里身体节点的原点在脚底）。 */
function heroBody(color, outline, hat) {
  const c = canvas(BODY, BODY)
  ellipse(c, 0, 48, 76, 20, 16, color, outline) // 身子
  ellipse(c, 0, 48, 42, 30, 30, color, outline) // 头
  ellipse(c, 0, 48, 30, 30, 16, hat, outline, 3) // 帽子 / 兜帽
  rect(c, 0, 37, 42, 6, 8, 0x1a1a1a) // 眼睛
  rect(c, 0, 53, 42, 6, 8, 0x1a1a1a)
  return c
}
save('hero_archer_body.png', heroBody(0x7ac46a, 0x24502a, 0x3f8a3a))
save('hero_mage_body.png', heroBody(0xa880e0, 0x45246e, 0x6a3ab0))
save('hero_knight_body.png', heroBody(0x8aa6cc, 0x2a3e5e, 0xb8c4d4))

/** 弓：竖直的弓身 + 弓弦，握持点在图的中心。 */
const bow = canvas(32, 84)
for (let y = 0; y < 84; y++) {
  const x = Math.round(20 - 12 * Math.sin((y / 83) * Math.PI))
  rect(bow, 0, x - 2, y, 5, 1, 0x8a5a2a)
}
rect(bow, 0, 19, 2, 1, 80, 0xf0e8d0)
save('hero_archer_weapon.png', bow)

const staff = canvas(24, 96)
rect(staff, 0, 10, 16, 4, 80, 0x6a4a2a)
ellipse(staff, 0, 12, 12, 10, 10, 0xff9a30, 0xb04a10, 2)
save('hero_mage_weapon.png', staff)

const sword = canvas(24, 96)
rect(sword, 0, 9, 4, 6, 64, 0xdde4ee)
rect(sword, 0, 2, 66, 20, 5, 0x8a6a2a)
rect(sword, 0, 10, 70, 4, 18, 0x5a3a1a)
save('hero_knight_weapon.png', sword)

// ---------------------------------------------------------------- 怪物和场地

/** 史莱姆：底宽顶圆的一团，脚底在下边缘。 */
const slime = canvas(64, 56)
ellipse(slime, 0, 32, 34, 28, 21, 0x6ad06a, 0x206a30)
rect(slime, 0, 21, 28, 6, 8, 0x1a1a1a)
rect(slime, 0, 37, 28, 6, 8, 0x1a1a1a)
save('slime.png', slime)

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
console.log('placeholders written to public/assets/')
