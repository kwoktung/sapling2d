// 生成示例用的占位图和关卡：node scripts/gen-assets.mjs
// - 图片：纯色几何图形（圆形角色、刀、图块），写成 PNG
// - 关卡：Tiled 的 JSON 格式（关卡 + 外部图块集），可以直接用 Tiled 打开继续编辑
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const OUT = new URL('../public/assets/', import.meta.url)
mkdirSync(new URL('levels/', OUT), { recursive: true })

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
/** 一张 RGBA 画布。 */
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
/** 填充矩形 [x, x + w) × [y, y + h)。 */
function fillRect(c, x, y, w, h, color) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) setPx(c, i, j, color)
}
/** 圆（按像素中心判断，边缘一圈描边）。 */
function fillCircle(c, cx, cy, r, color, outline, width = 3) {
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d > r) continue
      setPx(c, x, y, d > r - width ? outline : color)
    }
  }
}
const save = (name, c) => writeFileSync(new URL(name, OUT), png(c))

// ---------------------------------------------------------------- 角色和刀

/** 圆形角色：身体加两只眼睛（朝上），看得出转向。 */
function fighter(color, outline) {
  const c = canvas(72, 72)
  fillCircle(c, 36, 36, 36, color, outline, 4)
  fillCircle(c, 24, 24, 7, 0xffffff, 0x222222, 2)
  fillCircle(c, 48, 24, 7, 0xffffff, 0x222222, 2)
  return c
}
save('player.png', fighter(0x3a8dde, 0x1d4f80))
save('enemy.png', fighter(0xde4a3a, 0x80261d))

// 刀：14×64，刀尖朝上。上面 44px 是刀身（带刀尖），中间护手，下面刀柄
const knife = canvas(14, 64)
for (let y = 0; y < 44; y++) {
  // 刀尖：最上面 10px 逐渐变窄
  const half = y < 10 ? Math.max(1, Math.round((y + 1) * 0.6)) : 6
  for (let x = 7 - half; x < 7 + half; x++) setPx(knife, x, y, x < 7 ? 0xe8eef2 : 0xa9b4bc)
}
fillRect(knife, 0, 44, 14, 4, 0xd4a017)
fillRect(knife, 4, 48, 6, 16, 0x6b3e1e)
save('knife.png', knife)

// 摇杆：底座（半透明圆环）和摇杆头
function ring(size, color, alpha, width) {
  const c = canvas(size, size)
  const r = size / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r)
      if (d > r) continue
      setPx(c, x, y, color, d > r - width ? 200 : alpha)
    }
  }
  return c
}
save('stick-base.png', ring(220, 0xffffff, 50, 6))
save('stick-knob.png', ring(96, 0xffffff, 150, 4))

// ---------------------------------------------------------------- 图块集（48px：地板 ×2、墙、石头）

const TILE = 48
const TILE_ORDER = ['floor', 'floor2', 'wall', 'rock']
const ID = Object.fromEntries(TILE_ORDER.map((name, i) => [name, i + 1]))
const tiles = canvas(TILE * TILE_ORDER.length, TILE)
fillRect(tiles, 0, 0, TILE, TILE, 0xe9dfc8)
fillRect(tiles, TILE, 0, TILE, TILE, 0xe2d6bb)
fillRect(tiles, TILE * 2, 0, TILE, TILE, 0x5a4a3a)
fillRect(tiles, TILE * 2 + 4, 4, TILE - 8, TILE - 8, 0x6e5c48)
fillRect(tiles, TILE * 3, 0, TILE, TILE, 0xe9dfc8)
fillCircle(tiles, TILE * 3 + 24, 24, 22, 0x8d8d8d, 0x5c5c5c)
save('tiles.png', tiles)

// ---------------------------------------------------------------- 关卡（Tiled JSON）

const W = 32
const H = 44
const floor = new Array(W * H).fill(0)
const ground = new Array(W * H).fill(0)
const set = (layer, x, y, id) => (layer[y * W + x] = id)
const solid = (x, y) => ground[y * W + x] !== 0

for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(floor, x, y, (x + y) % 2 ? ID.floor2 : ID.floor)
// 四周的墙
for (let x = 0; x < W; x++) { set(ground, x, 0, ID.wall); set(ground, x, H - 1, ID.wall) }
for (let y = 0; y < H; y++) { set(ground, 0, y, ID.wall); set(ground, W - 1, y, ID.wall) }
// 墙段和石头堆
for (let x = 6; x < 13; x++) set(ground, x, 14, ID.wall)
for (let x = 19; x < 26; x++) set(ground, x, 14, ID.wall)
for (let y = 22; y < 28; y++) set(ground, 15, y, ID.wall)
for (const [x, y] of [[5, 6], [6, 6], [5, 7], [25, 8], [26, 8], [26, 9], [8, 31], [9, 31], [22, 33], [23, 33], [23, 34], [4, 38], [27, 39]]) set(ground, x, y, ID.rock)

// 固定种子的随机数：每次生成的关卡一样
let seed = 12345
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000)

const props = (o) => Object.entries(o).map(([name, value]) => ({ name, type: typeof value === 'number' ? 'int' : typeof value === 'boolean' ? 'bool' : 'string', value }))
let nextId = 1
const point = (type, x, y, extra = {}) => ({ id: nextId++, name: '', type, x, y, width: 0, height: 0, rotation: 0, visible: true, point: true, ...extra })
const objects = [point('Spawn', 16 * TILE, 38 * TILE)]
for (const [x, y, knives] of [[8, 8, 4], [24, 5, 6], [16, 19, 5], [6, 26, 3], [25, 28, 4]]) objects.push(point('Enemy', x * TILE, y * TILE, { properties: props({ knives }) }))
// 地上散落的刀：随机位置，避开墙和石头（离格子中心不超过 16px）
for (let n = 0; n < 40;) {
  const cx = 1 + Math.floor(rand() * (W - 2))
  const cy = 1 + Math.floor(rand() * (H - 2))
  if (solid(cx, cy)) continue
  objects.push(point('Knife', Math.round((cx + 0.5) * TILE + (rand() - 0.5) * 32), Math.round((cy + 0.5) * TILE + (rand() - 0.5) * 32)))
  n++
}

const tilesetFile = {
  type: 'tileset', version: '1.10', tiledversion: '1.10.2', name: 'tiles', image: '../tiles.png', imagewidth: TILE * TILE_ORDER.length, imageheight: TILE,
  tilewidth: TILE, tileheight: TILE, margin: 0, spacing: 0, columns: TILE_ORDER.length, tilecount: TILE_ORDER.length,
  tiles: ['wall', 'rock'].map((n) => ({ id: ID[n] - 1, properties: props({ collision: 'solid' }) })),
}
const layer = (id, name, data) => ({ id, name, type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data })
const map = {
  type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
  width: W, height: H, tilewidth: TILE, tileheight: TILE, nextlayerid: 4, nextobjectid: nextId,
  tilesets: [{ firstgid: 1, source: 'tiles.json' }],
  layers: [layer(1, 'Floor', floor), layer(2, 'Walls', ground), { id: 3, name: 'Entities', type: 'objectgroup', draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects }],
}
writeFileSync(new URL('levels/tiles.json', OUT), JSON.stringify(tilesetFile, null, 1))
writeFileSync(new URL('levels/arena.json', OUT), JSON.stringify(map))
console.log('assets generated: player.png enemy.png knife.png stick-*.png tiles.png levels/arena.json levels/tiles.json')
