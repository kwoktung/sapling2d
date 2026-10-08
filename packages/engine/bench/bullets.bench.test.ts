/**
 * 弹幕压测：不同子弹数量下，每帧的逻辑耗时（tree.advance：process、Tween、销毁）和渲染同步耗时（PixiRenderer.sync，不含 GPU）。
 *
 * 运行：pnpm bench:bullets          （有 JIT）
 *      pnpm bench:bullets:jitless  （无 JIT，近似 iOS 小游戏）
 *
 * 不做断言：耗时依赖机器。用来比较改动前后的变化。浏览器里的完整帧（含 WebGL）见 spikes/bullets。
 */
import { it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'
import { PixiRenderer } from '../src/render/PixiRenderer'
import { BulletStorm, config } from './bullets-scene'

const WARMUP = 120
const FRAMES = 600

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length
  return { avg, p95: s[Math.floor(s.length * 0.95)]!, max: s[s.length - 1]! }
}

const fmt = (n: number) => n.toFixed(2).padStart(6)

it('弹幕：逻辑 + 渲染同步耗时', async () => {
  const jitless = process.execArgv.includes('--jitless')
  const rows = ['bullets  nodes |  logic avg   p95 |   sync avg   p95   max |  total avg']
  for (const n of [100, 250, 500, 1000]) {
    config.bullets = n
    const g = await createTestGame({ main: BulletStorm, seed: 1 })
    const r = PixiRenderer._createForSyncTests()
    const logic: number[] = []
    const sync: number[] = []
    let nodes = 0
    for (let f = 0; f < WARMUP + FRAMES; f++) {
      const t0 = performance.now()
      g.step()
      const t1 = performance.now()
      r.sync(g.tree)
      const t2 = performance.now()
      if (f < WARMUP) continue
      logic.push(t1 - t0)
      sync.push(t2 - t1)
      if (f === WARMUP) nodes = countNodes(g.scene)
    }
    const l = stats(logic)
    const s = stats(sync)
    rows.push(`${String(n).padStart(7)} ${String(nodes).padStart(6)} | ${fmt(l.avg)} ${fmt(l.p95)} | ${fmt(s.avg)} ${fmt(s.p95)} ${fmt(s.max)} | ${fmt(l.avg + s.avg)}`)
  }
  console.log(`\nbullets benchmark (${jitless ? 'jitless' : 'jit'}), ms/frame\n` + rows.join('\n'))
}, 600_000)

function countNodes(n: { children: readonly { children: readonly unknown[] }[] }): number {
  let c = 1
  for (const ch of n.children) c += countNodes(ch as never)
  return c
}
