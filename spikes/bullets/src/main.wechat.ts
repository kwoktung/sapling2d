/**
 * 弹幕压测（微信小游戏真机）。依次跑 100 / 250 / 500 / 1000 颗子弹，每档 8 秒（前 2 秒预热），
 * 每帧分别计时：逻辑（tree.advance）、渲染同步（sync）、绘制（render 减去 sync，CPU 提交时间）。
 * 每档结束时 console.log 一行结果，全部结束后打印汇总并截图（需要构建时设置 SAPLING_LOG_URL）。
 * 屏幕左上角实时显示当前档位的数字。
 */
import { DOMAdapter } from 'pixi.js'
import { Game, Label, v } from 'sapling2d'
import { snapshot, WechatPlatform } from 'sapling2d/wechat'
import { WechatAdapter } from '@engine/src/platform/wechat/adapter'
import { PixiRenderer } from '@engine/src/render/PixiRenderer'
import { BulletStorm, config } from '@engine/bench/bullets-scene'
import { formatMicro, instrument, micro, perFrame } from '@engine/bench/bullets-profile'

const LEVELS = [100, 250, 500, 1000]
declare const __BULLETS_BUILD__: string | undefined
/** 构建时 BULLETS_PROFILE=1：不跑档位扫描，改为 500 颗的剖析（阶段耗时 + 基本操作）。 */
declare const __BULLETS_PROFILE__: boolean | undefined
const PROFILE = typeof __BULLETS_PROFILE__ === 'boolean' && __BULLETS_PROFILE__
const BUILD = typeof __BULLETS_BUILD__ === 'string' ? __BULLETS_BUILD__ : 'es2017'
const LEVEL_MS = 8000
const WARMUP_MS = 2000

/** 常驻的 HUD：Autoload 跨场景保留，zIndex 保证画在场景上面。 */
class Hud extends Label {
  constructor() {
    super({ fontSize: 22, color: 0x99ff99, align: 'left', verticalAlign: 'top', position: v(16, 60), zIndex: 100, lineHeight: 30 })
  }
}

type Row = { bullets: number; fps: number; frameP95: number; logic: number; sync: number; draw: number; logicP95: number }

async function main() {
  DOMAdapter.set(WechatAdapter)
  const platform = new WechatPlatform()
  const renderer = await PixiRenderer.create({ canvas: platform.canvas, webglVersion: 1, background: 0x0b1020, quietWarnings: [/does not support 32 index buffer/] })
  config.bullets = LEVELS[0]!
  const game = await Game.create({ main: BulletStorm, platform, autoloads: [Hud], seed: 1 })
  const hud = game.tree.autoload(Hud)
  const info = wx.getSystemInfoSync() as unknown as Record<string, unknown> // wx.d.ts 只声明了窗口信息
  const device = `${info.brand} ${info.model} · ${info.system} · ${info.platform} · SDK ${info.SDKVersion} · build ${BUILD}`
  console.log(`[bullets] start ${device} benchmarkLevel=${info.benchmarkLevel}`)

  if (PROFILE) return profile(game, renderer, platform, hud, device)

  const results: Row[] = []
  for (const n of LEVELS) {
    config.bullets = n
    if (n !== LEVELS[0]) await game.tree.reloadCurrentScene()
    const row = await run(game, renderer, platform, n, hud, results)
    results.push(row)
    console.log(`[bullets] ${fmt(row)}`)
  }
  const table = ['bullets |   fps  p95ms | logic  p95 |  sync |  draw', ...results.map(fmt)].join('\n')
  hud.text = `${device}\n\n${table}\n\ndone`
  console.log(`[bullets] done ${device}\n${table}`)
  snapshot('bullets-done')
}

/** 500 颗：先跑不包装的基线，再包装各阶段计时，最后在同一棵树上测基本操作。 */
async function profile(game: Game, renderer: PixiRenderer, platform: WechatPlatform, hud: Hud, device: string) {
  config.bullets = 500
  await game.tree.reloadCurrentScene()
  hud.text = 'profiling 500 bullets: baseline…'
  const baseline = await run(game, renderer, platform, 500, hud, [])
  const inst = instrument(() => platform.now())
  let frames = 0
  hud.text = 'profiling: instrumented…'
  await new Promise<void>((resolve) => {
    const loop = () => {
      game.tree.advance(1 / 60)
      renderer.render(game.tree)
      if (++frames === 60) inst.reset() // 前 60 帧不计
      if (frames === 60 + 300) return resolve()
      platform.requestFrame(loop)
    }
    platform.requestFrame(loop)
  })
  const phases = perFrame(inst, 300)
  inst.restore()
  hud.text = 'profiling: micro…'
  await new Promise((r) => setTimeout(r, 50))
  const rows = formatMicro(micro(() => platform.now(), game.tree, renderer))
  const text = `${device}\nbaseline 500: ${fmt(baseline)}\n\nphases (instrumented, ms/frame):\n${phases.join('\n')}\n\nmicro (ns/op):\n${rows.join('\n')}`
  console.log(`[bullets] profile ${text}`)
  hud.text = text + '\n\ndone'
  snapshot('bullets-profile')
}

function run(game: Game, renderer: PixiRenderer, platform: WechatPlatform, n: number, hud: Hud, results: Row[]): Promise<Row> {
  return new Promise((resolve) => {
    const s = { logic: [] as number[], sync: [] as number[], draw: [] as number[], interval: [] as number[] }
    const start = platform.now()
    let last = start
    let lastHud = 0
    const loop = () => {
      const now = platform.now()
      const t0 = now
      game.tree.advance((now - last) / 1000)
      const t1 = platform.now()
      renderer.sync(game.tree)
      const t2 = platform.now()
      renderer.render(game.tree) // 内部会再 sync 一次（这时没有脏节点，只是遍历）
      const t3 = platform.now()
      if (now - start > WARMUP_MS) {
        s.logic.push(t1 - t0)
        s.sync.push(t2 - t1)
        s.draw.push(t3 - t2)
        s.interval.push(now - last)
      }
      last = now
      if (now - lastHud > 500) {
        lastHud = now
        hud.text = [`bullets ${n}${now - start < WARMUP_MS ? ' (warmup)' : ''}`, fmt(summarize(n, s)), ...results.map(fmt)].join('\n')
      }
      if (now - start >= LEVEL_MS) return resolve(summarize(n, s))
      platform.requestFrame(loop)
    }
    platform.requestFrame(loop)
  })
}

function summarize(n: number, s: { logic: number[]; sync: number[]; draw: number[]; interval: number[] }): Row {
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)] ?? 0
  return { bullets: n, fps: 1000 / (avg(s.interval) || 1), frameP95: p95(s.interval), logic: avg(s.logic), logicP95: p95(s.logic), sync: avg(s.sync), draw: avg(s.draw) }
}

function fmt(r: Row) {
  const f = (x: number, w = 5) => x.toFixed(1).padStart(w)
  return `${String(r.bullets).padStart(7)} | ${f(r.fps)} ${f(r.frameP95, 6)} | ${f(r.logic)} ${f(r.logicP95, 4)} | ${f(r.sync)} | ${f(r.draw)}`
}

main().catch((err: unknown) => console.error('[bullets] failed', err))
