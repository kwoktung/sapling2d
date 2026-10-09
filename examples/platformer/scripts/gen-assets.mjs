// 生成示例用的像素图和关卡：node scripts/gen-assets.mjs
// - 图片：用字符画模板画（每个字符一种颜色），写成 PNG
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
function hex(color) {
  return [(color >> 16) & 255, (color >> 8) & 255, color & 255]
}
/** 把字符画模板画到 (ox, oy)：palette 里没有的字符（'.'）是透明。 */
function draw(c, ox, oy, rows, palette) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = palette[row[x]]
      if (color === undefined) continue
      const o = ((oy + y) * c.w + ox + x) * 4
      const [r, g, b] = hex(color)
      c.px[o] = r; c.px[o + 1] = g; c.px[o + 2] = b; c.px[o + 3] = 255
    }
  })
}
const save = (name, c) => writeFileSync(new URL(name, OUT), png(c))

// ---------------------------------------------------------------- 图块集（8 列 × 2 行，16px）

const P = { k: 0x000000, w: 0xfcfcfc, b: 0xc84c0c, B: 0x7c3c00, o: 0xfc9838, y: 0xfcbc3c, g: 0x00a800, G: 0x005800, l: 0x80d010, s: 0x5c94fc, c: 0xfcfcfc, C: 0xa4e4fc, d: 0x9c4a00, q: 0xe09050 }
const T = {
  ground: [
    'bbbbbbbbkbbbbbbk', 'bqqqqqqqkbqqqqqk', 'bqqqqqqqkbqqqqqk', 'bqqqqqqqkbqqqqqk', 'bqqqqqqqkbqqqqqk', 'bqqqqqqqkbkqqqqk', 'bqqqqqqqkbkkqqqk', 'kkqqqqqqkbbbkkkb',
    'bbkkqqqqkbqqqqqk', 'bqqbkkkkbqqqqqqk', 'bqqqbbbkbqqqqqqk', 'bqqqqqqkbqqqqqqk', 'bqqqqqqkbqqqqqqk', 'bqqqqqqkbqqqqqkk', 'bqqqqqqkbqqqqqkk', 'kkkkkkkkkkkkkkkk',
  ],
  brick: [
    'qqqqqqqqqqqqqqqq', 'bbbbbbbkbbbbbbbk', 'bbbbbbbkbbbbbbbk', 'kkkkkkkkkkkkkkkk', 'bbbkbbbbbbbkbbbb', 'bbbkbbbbbbbkbbbb', 'kkkkkkkkkkkkkkkk', 'bbbbbbbkbbbbbbbk',
    'bbbbbbbkbbbbbbbk', 'kkkkkkkkkkkkkkkk', 'bbbkbbbbbbbkbbbb', 'bbbkbbbbbbbkbbbb', 'kkkkkkkkkkkkkkkk', 'bbbbbbbkbbbbbbbk', 'bbbbbbbkbbbbbbbk', 'kkkkkkkkkkkkkkkk',
  ],
  question: [
    'qkkkkkkkkkkkkkkq', 'kyyyyyyyyyyyyyyk', 'kyBkyyyyyyyyyBky', 'kyyyyBBBBByyyyyk', 'kyyyBBkkkBBkyyyk', 'kyyyBBkyyBBkyyyk', 'kyyyykkyBBBkyyyk', 'kyyyyyyBBkkkyyyk',
    'kyyyyyyBBkyyyyyk', 'kyyyyyyykkyyyyyk', 'kyyyyyyBByyyyyyk', 'kyyyyyyBBkyyyyyk', 'kyBkyyyykkyyyBky', 'kyyyyyyyyyyyyyyk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk',
  ],
  used: [
    'kkkkkkkkkkkkkkkk', 'kBBBBBBBBBBBBBBk', 'kBkBBBBBBBBBBkBk', 'kBBBBBBBBBBBBBBk', 'kBBBBBBBBBBBBBBk', 'kBBBBBBBBBBBBBBk', 'kBBBBBBBBBBBBBBk', 'kBBBBBBBBBBBBBBk',
    'kBBBBBBBBBBBBBBk', 'kBBBBBBBBBBBBBBk', 'kBBBBBBBBBBBBBBk', 'kBBBBBBBBBBBBBBk', 'kBkBBBBBBBBBBkBk', 'kBBBBBBBBBBBBBBk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk',
  ],
  hard: [
    'qbbbbbbbbbbbbbbk', 'bqbbbbbbbbbbbbkk', 'bbqbbbbbbbbbbkkk', 'bbbqqqqqqqqqqkkk', 'bbbqqqqqqqqqqkkk', 'bbbqqqqqqqqqqkkk', 'bbbqqqqqqqqqqkkk', 'bbbqqqqqqqqqqkkk',
    'bbbqqqqqqqqqqkkk', 'bbbqqqqqqqqqqkkk', 'bbbqqqqqqqqqqkkk', 'bbbqqqqqqqqqqkkk', 'bbbkkkkkkkkkkkkk', 'bbkkkkkkkkkkkkkk', 'bkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk',
  ],
  pipeTopL: ['kkkkkkkkkkkkkkkk', 'klgggggggggggggg', 'klgggggggggggggg', 'klgggggggggggggg', 'klgggggggggggggg', 'klgggggggggggggg', 'klgggggggggggggg', 'klgggggggggggggg', 'klgggggggggggggg', 'klgggggggggggggg', 'klgggggggggggggg', 'klgggggggggggggg', 'klgggggggggggggg', 'klgggggggggggggg', 'kkkkkkkkkkkkkkkk', '..kkkkkkkkkkkkkk'],
  pipeTopR: ['kkkkkkkkkkkkkkkk', 'ggggggggGgGGGGGk', 'ggggggggGgGGGGGk', 'ggggggggGgGGGGGk', 'ggggggggGgGGGGGk', 'ggggggggGgGGGGGk', 'ggggggggGgGGGGGk', 'ggggggggGgGGGGGk', 'ggggggggGgGGGGGk', 'ggggggggGgGGGGGk', 'ggggggggGgGGGGGk', 'ggggggggGgGGGGGk', 'ggggggggGgGGGGGk', 'ggggggggGgGGGGGk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkk..'],
  pipeL: Array(16).fill('..klgggggggggggg'),
  pipeR: Array(16).fill('gggggggGgGGGGk..'),
  pole: Array(16).fill('.......gg.......'),
  ball: ['................', '................', '................', '................', '......kkkk......', '.....kggggk.....', '....kgllgggk....', '....kglggggk....', '....kggggggk....', '....kggggggk....', '.....kggggk.....', '......kkkk......', '.......gg.......', '.......gg.......', '.......gg.......', '.......gg.......'],
  cloud: ['................', '................', '......kkkk......', '....kkccccky....', '...kcccccccck...', '..kcccccccccck..', '.kccccccccccCck.', 'kccccccccccCCcck', 'kcccCccccccCCcck', 'kccCCccccccCccck', '.kcCCcccccccccck', '..kkcccccCccckk.', '....kkkkkkkkk...', '................', '................', '................'],
  bush: ['................', '................', '................', '................', '................', '................', '......kkkk......', '....kkllllkk....', '...klllllllgk...', '..klllgllllglk..', '.kllllglllllglk.', 'klllllllllllllgk', 'kllglllllllgllgk', 'kllglllllllgllgk', 'kgllllllgllllglk', 'kkkkkkkkkkkkkkkk'],
  flag: ['................', 'ggggggggg.......', '.gwwwwwwgg......', '..gwwgwwwgg.....', '...gwgggwwgg....', '....gwgwwwwgg...', '.....gwwwwwwgg..', '......ggggggggg.', '................', '................', '................', '................', '................', '................', '................', '................'],
}
const TILE_ORDER = ['ground', 'brick', 'question', 'used', 'hard', 'pipeTopL', 'pipeTopR', 'pipeL', 'pipeR', 'pole', 'ball', 'cloud', 'bush', 'flag']
export const ID = Object.fromEntries(TILE_ORDER.map((name, i) => [name, i + 1]))
const tiles = canvas(128, 32)
TILE_ORDER.forEach((name, i) => draw(tiles, (i % 8) * 16, Math.floor(i / 8) * 16, T[name], P))
save('tiles.png', tiles)

// ---------------------------------------------------------------- 角色

const M = { r: 0xd82800, k: 0x000000, s: 0xfca044, b: 0x2038ec, y: 0xfcbc3c, n: 0x885818 }
const mario = {
  idle: ['................', '......rrrrr.....', '.....rrrrrrrrr..', '.....nnnssks....', '....nsnsssksss..', '....nsnnsssksss.', '....nnssssskkkk.', '......sssssss...', '.....rrbrrr.....', '....rrrbrrbrrr..', '...rrrrbbbbrrrr.', '...ssrbybbybrss.', '...sssbbbbbbsss.', '...ssbbbbbbbbss.', '.....bbb..bbb...', '....nnn....nnn..'],
  run1: ['................', '......rrrrr.....', '.....rrrrrrrrr..', '.....nnnssks....', '....nsnsssksss..', '....nsnnsssksss.', '....nnssssskkkk.', '......sssssss...', '.....rrrrbr.ss..', '...ssrrrrrrsss..', '..sssbrrrrrrnn..', '..nnbbbbbbbbnn..', '.nnnbbbbbbbbnn..', '.nn.bbbb..bbb...', '.......bbb......', '.......nnnn.....'],
  run2: ['................', '......rrrrr.....', '.....rrrrrrrrr..', '.....nnnssks....', '....nsnsssksss..', '....nsnnsssksss.', '....nnssssskkkk.', '......sssssss...', '.....rrbrrbr....', '....rrrbbbrrr...', '....rrbbybbssr..', '....nnbbbbbsss..', '....nnnbbbbss...', '.....nnbbbb.....', '......nnnbbb....', '.......nnnnn....'],
  jump: ['.............sss', '......rrrrr..sss', '.....rrrrrrrrrss', '.....nnnssks.rrr', '....nsnsssksrrrr', '....nsnnsssksssr', '....nnssssskkkkr', '......ssssssrrr.', '..rrrrrbrrrbrr..', '.rrrrrrrbrrrbr.n', 'ssrrrrrrbbbbb.nn', 'sss.bbrbybbybnnn', '.s.bbbbbbbbbbnnn', '..nbbbbbbbbbbnnn', '.nnnbbbbbbb.....', '.nn.............'],
  dead: ['................', '.....s.rrrr.s...', '...sss.rrrr.sss.', '...ssnrrrrrrnss.', '.....nnsssknn...', '....nsnsssksns..', '....nsnnsssksn..', '....nnssssskkn..', '.....rsssssssr..', '....rrbrrrrbrr..', '...rrrbbbbbbrrr.', '...rrbybbbbybrr.', '...bbbbbbbbbbbb.', '...bbbbbbbbbbbb.', '...nnn......nnn.', '..nnnn......nnnn'],
}
const marioSheet = canvas(16 * 5, 16)
Object.values(mario).forEach((frame, i) => draw(marioSheet, i * 16, 0, frame, M))
save('mario.png', marioSheet)

const Gm = { b: 0x9c4a00, B: 0x000000, w: 0xfcfcfc, s: 0xfcbc8c }
const goomba = {
  walk1: ['................', '......bbbb......', '.....bbbbbb.....', '....bbbbbbbb....', '...bBBbbbbBBb...', '..bbbwBbbBwbbb..', '..bbbwBBBBwbbb..', '.bbbbwwbbwwbbbb.', '.bbbbbbbbbbbbbb.', 'bbbbbbbbbbbbbbbb', '.bbbbssssssbbbb.', '....ssssssss....', '...ssssssssss...', '...BBsssssBBB...', '..BBBBsss.BBBB..', '..BBBBB...BBBB..'],
  walk2: ['................', '......bbbb......', '.....bbbbbb.....', '....bbbbbbbb....', '...bBBbbbbBBb...', '..bbbwBbbBwbbb..', '..bbbwBBBBwbbb..', '.bbbbwwbbwwbbbb.', '.bbbbbbbbbbbbbb.', 'bbbbbbbbbbbbbbbb', '.bbbbssssssbbbb.', '....ssssssss....', '...ssssssssss...', '..BBBsssssBB....', '.BBBB.sssBBBB...', '.BBBB...BBBBB...'],
  flat: ['................', '................', '................', '................', '................', '................', '................', '................', '................', '......bbbb......', '...bbbbbbbbbb...', '..bbwwBbbBwwbb..', '.bbbbbbbbbbbbbb.', '..bbbssssssbbb..', '..BBBBB..BBBBB..', '.BBBBBB..BBBBBB.'],
}
const goombaSheet = canvas(16 * 3, 16)
Object.values(goomba).forEach((frame, i) => draw(goombaSheet, i * 16, 0, frame, Gm))
save('goomba.png', goombaSheet)

const Cn = { y: 0xfcbc3c, o: 0xc84c0c, w: 0xfcfcfc }
const coinFrames = [
  ['................', '.....oooooo.....', '....oyyyyyyo....', '...oyywyyyyyo...', '...oyywyyyyyo...', '...oyywyyyyyo...', '...oyywyyyyyo...', '...oyywyyyyyo...', '...oyywyyyyyo...', '...oyywyyyyyo...', '...oyywyyyyyo...', '...oyyyyyyyyo...', '....oyyyyyyo....', '.....oooooo.....', '................', '................'],
  ['................', '......oooo......', '.....oyyyyo.....', '.....oywyyo.....', '.....oywyyo.....', '.....oywyyo.....', '.....oywyyo.....', '.....oywyyo.....', '.....oywyyo.....', '.....oywyyo.....', '.....oywyyo.....', '.....oyyyyo.....', '.....oyyyyo.....', '......oooo......', '................', '................'],
  ['................', '.......oo.......', '......oyyo......', '......oyyo......', '......oyyo......', '......oyyo......', '......oyyo......', '......oyyo......', '......oyyo......', '......oyyo......', '......oyyo......', '......oyyo......', '......oyyo......', '.......oo.......', '................', '................'],
]
const coinSheet = canvas(16 * 4, 16)
;[0, 1, 2, 1].forEach((f, i) => draw(coinSheet, i * 16, 0, coinFrames[f], Cn))
save('coin.png', coinSheet)

// 屏幕按钮：40×40 的半透明圆，中间画箭头
function button(arrow) {
  const c = canvas(40, 40)
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      const d = Math.hypot(x + 0.5 - 20, y + 0.5 - 20)
      if (d > 19) continue
      const o = (y * 40 + x) * 4
      const edge = d > 17
      c.px[o] = 255; c.px[o + 1] = 255; c.px[o + 2] = 255; c.px[o + 3] = edge ? 200 : 70
    }
  }
  draw(c, 12, 12, arrow, { w: 0xfcfcfc })
  return c
}
const LEFT = ['......ww........', '.....www........', '....wwww........', '...wwwwwwwwwwww.', '..wwwwwwwwwwwww.', '.wwwwwwwwwwwwww.', '..wwwwwwwwwwwww.', '...wwwwwwwwwwww.', '....wwww........', '.....www........', '......ww........', '................', '................', '................', '................', '................'].map((r) => r)
save('btn-left.png', button(LEFT))
save('btn-right.png', button(LEFT.map((r) => [...r].reverse().join(''))))
save('btn-jump.png', button(['.......ww.......', '......wwww......', '.....wwwwww.....', '....wwwwwwww....', '...wwwwwwwwww...', '..wwwwwwwwwwww..', '.....wwwwww.....', '.....wwwwww.....', '.....wwwwww.....', '.....wwwwww.....', '.....wwwwww.....', '................', '................', '................', '................', '................']))

// ---------------------------------------------------------------- 关卡（Tiled JSON）

const W = 212
const H = 17
const GROUND = 15 // 地面顶部那一行
const ground = new Array(W * H).fill(0)
const back = new Array(W * H).fill(0)
const set = (layer, x, y, id) => (layer[y * W + x] = id)

// 地面和坑
const pits = [[69, 70], [86, 88], [153, 154]]
for (let x = 0; x < W; x++) {
  if (pits.some(([a, b]) => x >= a && x <= b)) continue
  for (let y = GROUND; y < H; y++) set(ground, x, y, ID.ground)
}
// 砖块和问号块（行 11 离地 4 格，行 7 离地 8 格）
const blocks = [
  [16, 11, 'question'], [20, 11, 'brick'], [21, 11, 'question'], [22, 11, 'brick'], [23, 11, 'question'], [24, 11, 'brick'], [22, 7, 'question'],
  [77, 11, 'brick'], [78, 11, 'question'], [79, 11, 'brick'],
  [80, 7, 'brick'], [81, 7, 'brick'], [82, 7, 'brick'], [83, 7, 'brick'], [84, 7, 'brick'], [85, 7, 'brick'], [86, 7, 'brick'], [87, 7, 'brick'],
  [91, 7, 'brick'], [92, 7, 'brick'], [93, 7, 'brick'], [94, 7, 'question'], [94, 11, 'brick'],
  [100, 11, 'brick'], [101, 11, 'brick'], [106, 11, 'question'], [109, 11, 'question'], [109, 7, 'question'], [112, 11, 'question'],
  [118, 11, 'brick'], [121, 7, 'brick'], [122, 7, 'brick'], [123, 7, 'brick'],
  [128, 7, 'brick'], [129, 7, 'question'], [130, 7, 'question'], [131, 7, 'brick'], [129, 11, 'brick'], [130, 11, 'brick'],
  [168, 11, 'brick'], [169, 11, 'brick'], [170, 11, 'question'], [171, 11, 'brick'],
]
for (const [x, y, kind] of blocks) set(ground, x, y, ID[kind])
// 水管
for (const [x, h] of [[28, 2], [38, 3], [46, 4], [57, 4], [163, 2], [179, 2]]) {
  for (let i = 0; i < h; i++) {
    const y = GROUND - 1 - i
    set(ground, x, y, i === h - 1 ? ID.pipeTopL : ID.pipeL)
    set(ground, x + 1, y, i === h - 1 ? ID.pipeTopR : ID.pipeR)
  }
}
// 台阶（硬砖）
const stairs = (x0, dir, n) => {
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) set(ground, dir > 0 ? x0 + i : x0 - i, GROUND - 1 - j, ID.hard)
}
stairs(134, 1, 4); stairs(143, -1, 4); stairs(148, 1, 4)
for (let j = 0; j < 4; j++) set(ground, 152, GROUND - 1 - j, ID.hard)
stairs(155, -1, 4)
stairs(181, 1, 8)
for (let j = 0; j < 8; j++) set(ground, 189, GROUND - 1 - j, ID.hard)
// 终点旗杆（只是装饰，过关看对象层的 Goal）
const POLE = 198
set(ground, POLE, GROUND - 1, ID.hard)
set(back, POLE, GROUND - 11, ID.ball)
for (let y = GROUND - 10; y < GROUND - 1; y++) set(back, POLE, y, ID.pole)
set(back, POLE - 1, GROUND - 9, ID.flag)
// 远景：云和灌木
for (let x = 8; x < W; x += 19) if (Math.abs(x - POLE) > 2) set(back, x, 3 + (Math.floor(x / 19) % 3), ID.cloud)
for (let x = 11; x < W; x += 16) if (ground[GROUND * W + x] && !ground[(GROUND - 1) * W + x]) set(back, x, GROUND - 1, ID.bush)

const props = (o) => Object.entries(o).map(([name, value]) => ({ name, type: typeof value === 'number' ? 'int' : typeof value === 'boolean' ? 'bool' : 'string', value }))
let nextId = 1
const obj = (type, x, y, extra = {}) => ({ id: nextId++, name: '', type, x, y, width: 16, height: 16, rotation: 0, visible: true, ...extra })
const objects = [obj('Spawn', 40, (GROUND - 1) * 16, { point: true, width: 0, height: 0 })]
for (const x of [22, 40, 51, 53, 80, 82, 97, 99, 114, 116, 124, 126, 128, 130, 174, 176]) objects.push(obj('Goomba', x * 16, (GROUND - 1) * 16))
for (const x of [79, 80, 81, 82]) objects.push(obj('Coin', x * 16, 5 * 16))
for (const x of [120, 121, 122]) objects.push(obj('Coin', x * 16, 9 * 16))
objects.push(obj('Goal', POLE * 16, 0, { width: 16, height: GROUND * 16 }))

const tilesetFile = {
  type: 'tileset', version: '1.10', tiledversion: '1.10.2', name: 'tiles', image: '../tiles.png', imagewidth: 128, imageheight: 32,
  tilewidth: 16, tileheight: 16, margin: 0, spacing: 0, columns: 8, tilecount: 16,
  tiles: [
    ...['ground', 'used', 'hard', 'pipeTopL', 'pipeTopR', 'pipeL', 'pipeR'].map((n) => ({ id: ID[n] - 1, properties: props({ collision: 'solid' }) })),
    { id: ID.brick - 1, properties: props({ collision: 'solid', breakable: true }) },
    { id: ID.question - 1, properties: props({ collision: 'solid', question: 'coin' }) },
  ].sort((a, b) => a.id - b.id),
}
const layer = (id, name, data) => ({ id, name, type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data })
const map = {
  type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
  width: W, height: H, tilewidth: 16, tileheight: 16, nextlayerid: 4, nextobjectid: nextId,
  properties: props({ time: 300 }),
  tilesets: [{ firstgid: 1, source: 'tiles.json' }],
  layers: [layer(1, 'Background', back), layer(2, 'Ground', ground), { id: 3, name: 'Entities', type: 'objectgroup', draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects }],
}
writeFileSync(new URL('levels/tiles.json', OUT), JSON.stringify(tilesetFile, null, 1))
writeFileSync(new URL('levels/1-1.json', OUT), JSON.stringify(map))
console.log('assets generated: tiles.png mario.png goomba.png coin.png btn-*.png levels/1-1.json levels/tiles.json')
