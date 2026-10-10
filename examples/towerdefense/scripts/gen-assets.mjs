// 生成灰盒原型的占位图：node scripts/gen-assets.mjs
// - 英雄：每种一张 6 帧的横条（96×96 一帧）：0–1 待机，2–5 攻击（前摇下蹲 → 蓄力 → 出手拉长 → 收招）
// - 怪物和它的白色剪影（受击闪白用）、槽位、箭、火球、爆炸、刀光、火花、射程圈
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

// ---------------------------------------------------------------- 英雄

const F = 96 // 一帧
/**
 * 一帧英雄：身体是椭圆（squash 压扁、stretch 拉长），武器画在身体上方（朝上，怪物从上面来）。
 * pose：身体的 [rx, ry, 向下偏移]、武器的 [长度, 抬起高度]、出手时有没有闪光。
 */
function heroFrame(c, i, look, pose) {
  const ox = i * F
  const [rx, ry, dy] = pose.body
  const cx = F / 2
  const cy = 64 + dy
  // 脚下阴影
  ellipse(c, ox, cx, 89, 24, 5, 0x000000, 0x000000, 1)
  for (let y = 0; y < c.h; y++) for (let x = ox; x < ox + F; x++) {
    const o = (y * c.w + x) * 4
    if (c.px[o + 3] === 255 && c.px[o] === 0 && c.px[o + 1] === 0 && c.px[o + 2] === 0 && y > 82) c.px[o + 3] = 90
  }
  const [len, lift] = pose.weapon
  look.weapon(c, ox, cx, cy - ry - lift, len)
  ellipse(c, ox, cx, cy, rx, ry, look.body, look.outline)
  // 眼睛
  rect(c, ox, cx - 9, cy - ry * 0.35, 5, 6, 0x1a1a1a)
  rect(c, ox, cx + 4, cy - ry * 0.35, 5, 6, 0x1a1a1a)
  if (pose.flash) ellipse(c, ox, cx, cy - ry - lift - len, 10, 10, 0xfff6c0, 0xffffff, 2)
}
const POSES = [
  { body: [24, 24, 0], weapon: [16, 0] }, // 待机
  { body: [25, 23, 1], weapon: [16, 0] },
  { body: [27, 20, 5], weapon: [12, -3] }, // 前摇：下蹲
  { body: [29, 17, 8], weapon: [9, -5] }, // 蓄力
  { body: [20, 28, -6], weapon: [22, 4], flash: true }, // 出手：拉长
  { body: [23, 25, -1], weapon: [18, 1] }, // 收招
]
const HEROES = {
  archer: {
    body: 0x58b858,
    outline: 0x1f5a24,
    weapon: (c, ox, x, top, len) => {
      rect(c, ox, x - 2, top - len, 4, len, 0x8a5a2a) // 弓身
      rect(c, ox, x - 12, top - len, 24, 4, 0x8a5a2a)
    },
  },
  mage: {
    body: 0x9a62d8,
    outline: 0x45246e,
    weapon: (c, ox, x, top, len) => {
      rect(c, ox, x + 14, top - len + 10, 4, len + 20, 0x6a4a2a) // 法杖
      ellipse(c, ox, x + 16, top - len + 8, 7, 7, 0xff9a30, 0xb04a10, 2)
    },
  },
  knight: {
    body: 0x6a8ab8,
    outline: 0x2a3e5e,
    weapon: (c, ox, x, top, len) => {
      rect(c, ox, x - 3, top - len, 6, len, 0xdde4ee) // 剑
      rect(c, ox, x - 10, top - 2, 20, 4, 0x8a6a2a)
    },
  },
}
for (const [name, look] of Object.entries(HEROES)) {
  const c = canvas(F * POSES.length, F)
  POSES.forEach((pose, i) => heroFrame(c, i, look, pose))
  save(`hero_${name}.png`, c)
}

// ---------------------------------------------------------------- 怪物

/** 怪物 56×56：带描边的圆和眼睛。`white` 时整只画成白色剪影（受击闪白）。 */
function enemy(white) {
  const c = canvas(56, 56)
  ellipse(c, 0, 28, 30, 25, 24, white ? 0xffffff : 0xd0503c, white ? 0xffffff : 0x6a1e14)
  if (!white) {
    rect(c, 0, 16, 22, 7, 8, 0xffffff)
    rect(c, 0, 33, 22, 7, 8, 0xffffff)
    rect(c, 0, 18, 25, 4, 4, 0x1a1a1a)
    rect(c, 0, 35, 25, 4, 4, 0x1a1a1a)
  }
  return c
}
save('enemy.png', enemy(false))
save('enemy_flash.png', enemy(true))

// ---------------------------------------------------------------- 场地和特效

const slot = canvas(100, 100)
ellipse(slot, 0, 50, 50, 46, 46, 0x3a4a3a, 0x5a6e5a, 4)
save('slot.png', slot)

const arrow = canvas(8, 36)
rect(arrow, 0, 3, 6, 2, 30, 0xe8d8b0)
for (let y = 0; y < 8; y++) rect(arrow, 0, 4 - y / 2, y, Math.max(1, y), 1, 0xffffff)
save('arrow.png', arrow)

save('glow.png', softCircle(64, 0.3)) // 火球、爆炸、闪光：白色，按需染色
save('spark.png', softCircle(12, 0.4))
save('range.png', ring(256, 4, 160))

// 刀光：上方 120° 的弧（白色，边缘淡出），圆心在图中心
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

// 界面：圆角就不做了，纯白方块用 ColorRect；英雄栏图标直接用英雄第 0 帧
console.log('assets written to public/assets/')
