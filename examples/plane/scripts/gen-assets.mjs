// 生成飞机大战的素材：精灵图集（sprites.png + src/sprites.json，TexturePacker 的 JSON Hash 格式）、
// 爆炸网格图（explosion.png，4 列 × 2 行）、可以上下无缝拼接的星空背景，以及 ffmpeg 合成的音效和 BGM。
// 运行：node scripts/gen-assets.mjs（生成的文件已提交，平时不需要再跑）
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

// ---------------------------------------------------------------- PNG 编码

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
function encodePng(img) {
  const { w, h, px } = img
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const a = px[i + 3]
      const o = y * (w * 4 + 1) + 1 + x * 4
      // 内部是预乘 alpha，写出时还原
      raw[o] = a > 0 ? clamp((px[i] / a) * 255) : 0
      raw[o + 1] = a > 0 ? clamp((px[i + 1] / a) * 255) : 0
      raw[o + 2] = a > 0 ? clamp((px[i + 2] / a) * 255) : 0
      raw[o + 3] = clamp(a * 255)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))

// ---------------------------------------------------------------- 光栅化（4×4 超采样抗锯齿）

/** 预乘 alpha 的浮点画布，颜色分量 0–1。 */
function image(w, h) {
  return { w, h, px: new Float32Array(w * h * 4) }
}

/** 用 inside(x, y) 判断的形状填充颜色 [r, g, b, a]（0–255 / 0–1）；color 也可以是 (x, y) => 颜色。 */
function fill(img, bbox, inside, color) {
  const S = 4
  const [x0, y0, x1, y1] = bbox.map((v, i) => (i < 2 ? Math.max(0, Math.floor(v)) : Math.min(i === 2 ? img.w : img.h, Math.ceil(v))))
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      let cover = 0
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) if (inside(x + (sx + 0.5) / S, y + (sy + 0.5) / S)) cover++
      if (!cover) continue
      const [r, g, b, a = 1] = typeof color === 'function' ? color(x + 0.5, y + 0.5) : color
      blend(img, x, y, r / 255, g / 255, b / 255, a * (cover / (S * S)))
    }
  }
}

function blend(img, x, y, r, g, b, a) {
  const i = (y * img.w + x) * 4
  const p = img.px
  const k = 1 - a
  p[i] = r * a + p[i] * k
  p[i + 1] = g * a + p[i + 1] * k
  p[i + 2] = b * a + p[i + 2] * k
  p[i + 3] = a + p[i + 3] * k
}

/** 加色光晕：中心 alpha 为 a，半径 r 处衰减到 0。 */
function glow(img, cx, cy, r, [cr, cg, cb], a) {
  for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(img.h, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(img.w, Math.ceil(cx + r)); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r
      if (d >= 1) continue
      blend(img, x, y, cr / 255, cg / 255, cb / 255, a * (1 - d) ** 2)
    }
  }
}

function polygon(img, points, color) {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const inside = (x, y) => {
    let c = false
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i]
      const [xj, yj] = points[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
    }
    return c
  }
  fill(img, [Math.min(...xs), Math.min(...ys), Math.max(...xs) + 1, Math.max(...ys) + 1], inside, color)
}

function ellipse(img, cx, cy, rx, ry, color) {
  fill(img, [cx - rx, cy - ry, cx + rx + 1, cy + ry + 1], (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, color)
}

/** 左右对称的多边形：只给右半边的点（x 相对中线），自动镜像。 */
function mirrored(cx, half) {
  return [...half.map(([x, y]) => [cx + x, y]), ...[...half].reverse().map(([x, y]) => [cx - x, y])]
}

/** 竖直方向的线性渐变色。 */
const vgrad = (top, bottom, y0, y1) => (_x, y) => {
  const t = Math.max(0, Math.min(1, (y - y0) / (y1 - y0)))
  return top.map((c, i) => c + (bottom[i] - c) * t)
}

// ---------------------------------------------------------------- 精灵

const sprites = {}

// 玩家战机（机头朝上）110×120
{
  const img = image(110, 120)
  const cx = 55
  glow(img, cx, 112, 22, [80, 200, 255], 0.9) // 尾焰
  polygon(img, mirrored(cx, [[0, 4], [8, 22], [12, 60], [52, 82], [52, 94], [14, 90], [10, 104], [0, 104]]), vgrad([150, 220, 255], [40, 110, 200], 0, 104))
  polygon(img, mirrored(cx, [[30, 66], [52, 82], [52, 94], [30, 86]]), [30, 80, 160]) // 翼尖
  polygon(img, mirrored(cx, [[14, 90], [26, 104], [10, 104]]), [30, 80, 160]) // 尾翼
  ellipse(img, cx, 40, 7, 16, vgrad([230, 250, 255], [60, 160, 230], 24, 56)) // 座舱
  sprites.player = img
}

// 小型敌机（机头朝下）70×70
{
  const img = image(70, 70)
  const cx = 35
  polygon(img, mirrored(cx, [[0, 68], [8, 50], [32, 20], [32, 8], [10, 14], [6, 2], [0, 2]]), vgrad([120, 30, 40], [240, 80, 80], 0, 68))
  ellipse(img, cx, 36, 6, 10, [255, 210, 120])
  sprites.enemy_small = img
}

// 中型敌机 100×92
{
  const img = image(100, 92)
  const cx = 50
  polygon(img, mirrored(cx, [[0, 90], [12, 70], [48, 44], [48, 22], [20, 26], [14, 4], [0, 8]]), vgrad([130, 70, 20], [250, 160, 50], 0, 90))
  polygon(img, mirrored(cx, [[30, 34], [48, 22], [48, 44], [36, 52]]), [150, 60, 20])
  ellipse(img, cx, 52, 9, 14, [255, 240, 170])
  ellipse(img, cx - 30, 46, 5, 5, [255, 120, 60])
  ellipse(img, cx + 30, 46, 5, 5, [255, 120, 60])
  sprites.enemy_medium = img
}

// 大型敌机 180×150
{
  const img = image(180, 150)
  const cx = 90
  polygon(img, mirrored(cx, [[0, 148], [24, 128], [40, 112], [88, 92], [88, 52], [60, 40], [40, 8], [0, 14]]), vgrad([70, 30, 110], [180, 100, 230], 0, 148))
  polygon(img, mirrored(cx, [[56, 60], [88, 52], [88, 92], [62, 100]]), [90, 40, 140])
  ellipse(img, cx, 84, 18, 26, vgrad([255, 250, 220], [255, 170, 80], 58, 110))
  for (const dx of [-58, -30, 30, 58]) ellipse(img, cx + dx, 102, 6, 6, [255, 90, 150])
  sprites.enemy_large = img
}

// 玩家子弹 16×42
{
  const img = image(16, 42)
  glow(img, 8, 21, 16, [80, 200, 255], 0.6)
  ellipse(img, 8, 21, 4, 18, vgrad([255, 255, 255], [120, 220, 255], 3, 39))
  sprites.bullet_player = img
}

// 敌方子弹 24×24
{
  const img = image(24, 24)
  glow(img, 12, 12, 12, [255, 80, 160], 0.7)
  ellipse(img, 12, 12, 6, 6, [255, 230, 245])
  sprites.bullet_enemy = img
}

// 道具：武器升级（绿色，向上的双箭头）、生命（红心）56×56
{
  const img = image(56, 56)
  glow(img, 28, 28, 28, [80, 255, 140], 0.5)
  ellipse(img, 28, 28, 22, 22, [30, 140, 70])
  ellipse(img, 28, 28, 18, 18, [60, 200, 100])
  for (const y of [14, 28]) polygon(img, [[28, y], [40, y + 12], [34, y + 12], [28, y + 6], [22, y + 12], [16, y + 12]], [240, 255, 240])
  sprites.powerup_power = img
}
{
  const img = image(56, 56)
  glow(img, 28, 28, 28, [255, 90, 110], 0.5)
  const heart = (x, y) => {
    const u = (x - 28) / 18
    const v = -(y - 30) / 18
    return (u * u + v * v - 1) ** 3 - u * u * v * v * v <= 0
  }
  fill(img, [6, 6, 50, 50], heart, vgrad([255, 140, 150], [210, 30, 60], 10, 46))
  sprites.powerup_life = img
}

// 暂停按钮 72×72
{
  const img = image(72, 72)
  ellipse(img, 36, 36, 34, 34, [255, 255, 255, 0.18])
  polygon(img, [[24, 22], [32, 22], [32, 50], [24, 50]], [255, 255, 255])
  polygon(img, [[40, 22], [48, 22], [48, 50], [40, 50]], [255, 255, 255])
  sprites.pause = img
}

// 纯白方块：拉伸后当遮罩 / 血条用（引擎还没有画矩形的节点）
{
  const img = image(8, 8)
  fill(img, [0, 0, 8, 8], () => true, [255, 255, 255])
  sprites.white = img
}

// ---------------------------------------------------------------- 打包图集（按高度排序的货架算法）

function pack(entries, width, pad = 2) {
  const sorted = Object.entries(entries).sort((a, b) => b[1].h - a[1].h)
  let x = pad
  let y = pad
  let shelf = 0
  const placed = {}
  for (const [name, img] of sorted) {
    if (x + img.w + pad > width) {
      x = pad
      y += shelf + pad
      shelf = 0
    }
    placed[name] = { x, y, img }
    x += img.w + pad
    shelf = Math.max(shelf, img.h)
  }
  let height = 1
  while (height < y + shelf + pad) height *= 2
  const atlas = image(width, height)
  const frames = {}
  for (const [name, { x: ox, y: oy, img }] of Object.entries(placed)) {
    for (let yy = 0; yy < img.h; yy++) atlas.px.set(img.px.subarray(yy * img.w * 4, (yy + 1) * img.w * 4), ((oy + yy) * width + ox) * 4)
    frames[name] = {
      frame: { x: ox, y: oy, w: img.w, h: img.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: img.w, h: img.h },
      sourceSize: { w: img.w, h: img.h },
    }
  }
  return { atlas, json: { frames, meta: { app: 'scripts/gen-assets.mjs', image: 'sprites.png', format: 'RGBA8888', size: { w: width, h: height }, scale: '1' } } }
}

mkdirSync('public/assets/sfx', { recursive: true })
const { atlas, json } = pack(sprites, 512)
writeFileSync('public/assets/sprites.png', encodePng(atlas))
writeFileSync('src/sprites.json', JSON.stringify(json, null, 2) + '\n')

// ---------------------------------------------------------------- 爆炸：4 列 × 2 行，每帧 128×128

{
  const F = 128
  const img = image(F * 4, F * 2)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const debris = Array.from({ length: 14 }, () => ({ a: rnd() * Math.PI * 2, s: 0.6 + rnd() * 0.6 }))
  for (let i = 0; i < 8; i++) {
    const cx = (i % 4) * F + F / 2
    const cy = Math.floor(i / 4) * F + F / 2
    const t = i / 7
    const r = 16 + t * 44
    const fade = 1 - t ** 1.5
    glow(img, cx, cy, r * 1.5, [255, 140, 40], 0.8 * fade)
    ellipse(img, cx, cy, r, r, [255, 200 - t * 120, 80 - t * 60, 0.85 * fade])
    ellipse(img, cx, cy, Math.max(2, r * (0.7 - t * 0.6)), Math.max(2, r * (0.7 - t * 0.6)), [255, 255, 220, fade])
    for (const d of debris) {
      const dr = r * 1.3 * d.s
      ellipse(img, cx + Math.cos(d.a) * dr, cy + Math.sin(d.a) * dr, 3 * fade + 1, 3 * fade + 1, [255, 220, 150, fade])
    }
  }
  writeFileSync('public/assets/explosion.png', encodePng(img))
}

// ---------------------------------------------------------------- 星空背景 750×1334，上下无缝

{
  const W = 750
  const H = 1334
  const img = image(W, H)
  fill(img, [0, 0, W, H], () => true, [11, 11, 38]) // 纯色底：渐变的话上下拼接处会有一道缝
  let seed = 42
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  // 星云：几团淡淡的光，跨越上下边界的在另一边再画一次
  for (let i = 0; i < 5; i++) {
    const x = rnd() * W
    const y = rnd() * H
    const r = 180 + rnd() * 220
    const color = rnd() < 0.5 ? [90, 60, 180] : [40, 90, 170]
    for (const dy of [-H, 0, H]) glow(img, x, y + dy, r, color, 0.18)
  }
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W
    const y = rnd() * H
    const big = rnd() < 0.12
    const r = big ? 1.6 + rnd() * 1.2 : 0.6 + rnd() * 0.8
    const b = 150 + rnd() * 105
    for (const dy of [-H, 0, H]) {
      if (big) glow(img, x, y + dy, r * 5, [160, 190, 255], 0.35)
      ellipse(img, x, y + dy, r, r, [b, b, Math.min(255, b + 30)])
    }
  }
  writeFileSync('public/assets/background.png', encodePng(img))
}

// ---------------------------------------------------------------- 声音（ffmpeg 合成）

const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args])
const tone = (out, expr, dur, filters = []) =>
  ff(['-f', 'lavfi', '-i', `aevalsrc=${expr}:s=44100:d=${dur}`, ...(filters.length ? ['-af', filters.join(',')] : []), '-ac', '1', '-b:a', '64k', out])

// 射击：极短的高音（每秒响很多次，要轻）
tone('public/assets/sfx/shoot.mp3', "'0.25*sin(2*PI*(1400-5000*t)*t)*exp(-60*t)'", 0.06)
// 敌机爆炸：低通噪声 + 低频轰鸣
tone('public/assets/sfx/explode.mp3', "'(0.6*(random(0)*2-1)+0.5*sin(2*PI*(90-60*t)*t))*exp(-7*t)'", 0.6, ['lowpass=f=1800'])
// 玩家被击中：更低、更长
tone('public/assets/sfx/hit.mp3', "'(0.5*(random(0)*2-1)+0.6*sin(2*PI*(70-30*t)*t))*exp(-4*t)'", 0.9, ['lowpass=f=900'])
// 拾取道具：上行三连音
tone('public/assets/sfx/powerup.mp3', "'0.4*(sin(2*PI*660*t)*lt(t,0.07)+sin(2*PI*880*t)*between(t,0.07,0.14)+sin(2*PI*1320*t)*gte(t,0.14))*exp(-4*mod(t,0.07))'", 0.3)
// 游戏结束：下行
tone('public/assets/sfx/gameover.mp3', "'0.45*sin(2*PI*(440-260*t)*t)*exp(-1.5*t)'", 1.2)
// BGM：A 小调，低音 + 琶音，16 拍一循环（8 秒）
{
  const bass = [110, 110, 87.31, 87.31, 130.81, 130.81, 98, 98] // A F C G，每个两拍
  const arp = [220, 261.63, 329.63, 261.63, 174.61, 220, 261.63, 220, 261.63, 329.63, 392, 329.63, 196, 246.94, 293.66, 246.94]
  const pick = (notes, rate) => notes.map((f, i) => `${f}*eq(mod(floor(t*${rate}),${notes.length}),${i})`).join('+')
  tone(
    'public/assets/bgm.mp3',
    `'0.16*sin(2*PI*(${pick(bass, 1)})*t)+0.07*sin(2*PI*(${pick(arp, 2)})*t)*(1-0.7*mod(t*2,1))'`,
    8,
  )
}
console.log('assets generated')
