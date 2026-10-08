/**
 * 弹幕压测（浏览器，真实 WebGL）。每帧分别计时：逻辑（tree.advance）、渲染同步（sync）、绘制（render 减去 sync）。
 *
 * - `?n=500`：固定子弹数量，HUD 实时显示
 * - `?sweep`：依次跑 100 / 250 / 500 / 1000 颗，每档 6 秒（前 2 秒预热），结果放在 `window.results`
 *
 * 注意：WebGL 是异步的，“绘制”只是 CPU 提交命令的时间；GPU 是否跟得上看帧间隔（fps）。
 */
import { Game } from 'sapling2d'
import { BrowserPlatform } from 'sapling2d/browser'
import { PixiRenderer } from '@engine/src/render/PixiRenderer'
import { BulletStorm, config } from '@engine/bench/bullets-scene'

const params = new URLSearchParams(location.search)
const sweep = params.has('sweep')
const levels = sweep ? [100, 250, 500, 1000] : [Number(params.get('n') ?? 500)]

const canvas = document.createElement('canvas')
canvas.style.cssText = 'position:fixed;left:0;top:0;display:block;touch-action:none'
document.body.style.cssText = 'margin:0;overflow:hidden;background:#0b1020'
document.body.appendChild(canvas)

const platform = new BrowserPlatform({ canvas })
const renderer = await PixiRenderer.create({ canvas, background: 0x0b1020 })
const hud = document.getElementById('hud')!

type Row = { bullets: number; fps: number; logic: number; sync: number; draw: number; frameP95: number }
const results: Row[] = []
Object.assign(globalThis, { results })

for (const n of levels) {
  config.bullets = n
  const game = await Game.create({ main: BulletStorm, platform, seed: 1 })
  results.push(await run(game, n, sweep ? 6000 : Infinity))
  game.destroy()
}
hud.textContent += '\n\ndone'
Object.assign(globalThis, { done: true })

function run(game: Game, n: number, durationMs: number): Promise<Row> {
  return new Promise((resolve) => {
    const s = { logic: [] as number[], sync: [] as number[], draw: [] as number[], interval: [] as number[] }
    const start = performance.now()
    let last = start
    const loop = (now: number) => {
      const dt = (now - last) / 1000
      const t0 = performance.now()
      game.tree.advance(dt)
      const t1 = performance.now()
      renderer.sync(game.tree)
      const t2 = performance.now()
      renderer.render(game.tree) // 内部会再 sync 一次（这时没有脏节点，只是遍历）
      const t3 = performance.now()
      if (now - start > 2000) {
        s.logic.push(t1 - t0)
        s.sync.push(t2 - t1)
        s.draw.push(t3 - t2)
        s.interval.push(now - last)
      }
      last = now
      const row = summarize(n, s)
      hud.textContent = `bullets ${n}  (nodes ${countNodes(game.tree.currentScene!)})\nfps     ${row.fps.toFixed(1)}  (frame p95 ${row.frameP95.toFixed(1)} ms)\nlogic   ${row.logic.toFixed(2)} ms\nsync    ${row.sync.toFixed(2)} ms\ndraw    ${row.draw.toFixed(2)} ms (CPU)` + (results.length ? '\n\n' + results.map(fmt).join('\n') : '')
      if (now - start >= durationMs) return resolve(row)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })
}

function summarize(n: number, s: { logic: number[]; sync: number[]; draw: number[]; interval: number[] }): Row {
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const sorted = [...s.interval].sort((a, b) => a - b)
  return { bullets: n, fps: 1000 / (avg(s.interval) || 1), logic: avg(s.logic), sync: avg(s.sync), draw: avg(s.draw), frameP95: sorted[Math.floor(sorted.length * 0.95)] ?? 0 }
}

function fmt(r: Row) {
  return `${String(r.bullets).padStart(5)}: fps ${r.fps.toFixed(1)} p95 ${r.frameP95.toFixed(1)}ms | logic ${r.logic.toFixed(2)} sync ${r.sync.toFixed(2)} draw ${r.draw.toFixed(2)}`
}

function countNodes(n: { children: readonly unknown[] }): number {
  let c = 1
  for (const ch of n.children) c += countNodes(ch as never)
  return c
}
