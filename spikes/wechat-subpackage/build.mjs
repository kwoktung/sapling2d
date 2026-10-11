// 分包实验（.scratch/wechat-subpackages/issues/01）：生成小游戏工程 dist/
//   主包：game.js + boot/logo.png
//   分包 pkg/：game.js（NO_ENTRY=1 时不生成）、img.png、data.json、sfx.mp3、big-*.png（随机噪点，凑体积，让下载看得出进度）
// 环境变量：WX_APPID、LOG_HOST（这台电脑的局域网 IP）、DELAY（启动后等几秒再加载分包，用来测断网）、BIG_MB（分包体积，默认 4）
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { deflateSync } from 'node:zlib'

const here = (p) => new URL(p, import.meta.url).pathname
const dist = here('dist/')
const appid = process.env.WX_APPID || 'touristappid'
const logHost = process.env.LOG_HOST || '127.0.0.1'
const delay = Number(process.env.DELAY || 0)
const bigMb = Number(process.env.BIG_MB || 4)
const noEntry = process.env.NO_ENTRY === '1'

// 保留开发者工具写的 project.private.config.json
for (const p of ['game.js', 'boot', 'pkg']) rmSync(dist + p, { recursive: true, force: true })
mkdirSync(dist + 'boot', { recursive: true })
mkdirSync(dist + 'pkg', { recursive: true })

const fruit = here('../wechat/assets/fruit.png')
cpSync(fruit, dist + 'boot/logo.png')
cpSync(fruit, dist + 'pkg/img.png')
cpSync(here('../wechat/assets/pop.mp3'), dist + 'pkg/sfx.mp3')
writeFileSync(dist + 'pkg/data.json', JSON.stringify({ hello: 'subpackage', n: 42 }))
if (!noEntry) writeFileSync(dist + 'pkg/game.js', 'GameGlobal.__pkgEntryRan = Date.now()\n')

// 每张 1024×1024 RGB 噪点约 3 MB，按 BIG_MB 生成若干张
const big = noisePng(1024, 1024)
const count = Math.max(1, Math.round((bigMb * 1024 * 1024) / big.length))
for (let i = 0; i < count; i++) writeFileSync(dist + `pkg/big-${i}.png`, big)

writeFileSync(dist + 'game.json', JSON.stringify({ deviceOrientation: 'portrait', showStatusBar: false, subpackages: [{ name: 'pkg', root: 'pkg/' }] }, null, 2))
writeFileSync(
  dist + 'project.config.json',
  JSON.stringify({ appid, projectname: 'sapling2d-subpackage-spike', compileType: 'game', libVersion: '3.0.0', setting: { es6: true, enhance: true, minified: false, urlCheck: false } }, null, 2),
)
const game = readFileSync(here('src/game.js'), 'utf8')
  .replace('__LOG_URL__', JSON.stringify(`http://${logHost}:7778/log`))
  .replace('__DELAY__', String(delay))
  .replace('__BIG_COUNT__', String(count))
  .replace('__BUILD__', JSON.stringify({ noEntry, delay, bigMb: +(count * big.length / 1048576).toFixed(2), t: new Date().toISOString() }))
writeFileSync(dist + 'game.js', game)
console.log(`dist/ ready: subpackage ${(count * big.length / 1048576).toFixed(1)} MB in ${count} big png(s)${noEntry ? ', no pkg/game.js' : ''}${delay ? `, load after ${delay}s` : ''}; log → ${logHost}`)
if (!existsSync(dist + 'project.private.config.json')) console.log('open dist/ in WeChat DevTools, or use the cli preview command')

/** 最小的 PNG 编码器：RGB、无滤波。 */
function noisePng(w, h) {
  const raw = randomBytes((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0 // 每行开头的滤波字节
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // 位深
  ihdr[9] = 2 // RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))])
}

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}
