/**
 * TileMap 渲染压测（浏览器，真实 WebGL）。
 *
 * - `?mode=mesh&fill&extrude`：只跑一种画法，一直跑，HUD 实时显示
 * - `?sweep`：依次跑全部画法（稀疏地图、满地图），每档 8 秒（前 2 秒预热），结果放在 `window.results`；`&ms=3000` 改每档时长
 * - `&free`：不用 requestAnimationFrame，用 MessageChannel 连续跑帧（后台标签页里 rAF 会暂停；只用来检查能不能跑通，数字不可信）
 */
import { BrowserPlatform } from 'sapling2d/browser'
import { createBench, fmt, HEADER, MODES, type Mode, type Row } from './bench'

const params = new URLSearchParams(location.search)
const canvas = document.createElement('canvas')
canvas.style.cssText = 'position:fixed;left:0;top:0;display:block;touch-action:none'
document.body.style.cssText = 'margin:0;overflow:hidden;background:#000'
document.body.appendChild(canvas)

const platform = new BrowserPlatform({ canvas })
const channel = new MessageChannel()
let pending: (() => void) | null = null
channel.port1.onmessage = () => pending?.()
function freeFrame(cb: () => void) {
  pending = cb
  channel.port2.postMessage(0)
}
const bench = await createBench({
  canvas,
  now: () => performance.now(),
  requestFrame: params.has('free') ? freeFrame : (cb) => requestAnimationFrame(() => cb()),
  screen: () => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }),
  loadImage: async (path) => (await platform.loadImage(path)).resource,
  webglVersion: 2,
})

const results: Row[] = []
Object.assign(globalThis, { results })
const runs = params.has('sweep')
  ? [false, true].flatMap((fill) => [false, true].flatMap((camGroup) => MODES.map((mode) => ({ mode, fill, camGroup, extrude: false, durationMs: Number(params.get('ms') ?? 8000) }))))
  : [{ mode: (params.get('mode') ?? 'mesh') as Mode, fill: params.has('fill'), camGroup: params.has('cam'), extrude: params.has('extrude'), durationMs: Infinity }]

for (const run of runs) {
  const row = await bench.run(run, (r) => bench.hud([HEADER, fmt(r), ...results.map(fmt)].join('\n')))
  results.push(row)
  console.log(`[tilemap] ${fmt(row)}`)
}
bench.hud([HEADER, ...results.map(fmt), '', 'done'].join('\n'))
console.log(['[tilemap] done', HEADER, ...results.map(fmt)].join('\n'))
Object.assign(globalThis, { done: true })
