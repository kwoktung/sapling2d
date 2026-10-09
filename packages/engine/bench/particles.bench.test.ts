/**
 * Particles2D 的模拟耗时（每帧 tree.advance，不含渲染）：一个持续发射、维持 500 个粒子的发射器。
 *
 * 运行：SAPLING_BENCH=1 [SAPLING_JITLESS=1] vitest run bench/particles.bench
 */
import { it } from 'vitest'
import { Particles2D, Scene, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

it('Particles2D：模拟耗时', async () => {
  const rows = [`Particles2D（${process.execArgv.includes('--jitless') ? '无 JIT' : '有 JIT'}）`, 'particles | logic avg ms']
  for (const amount of [100, 500, 2000]) {
    const g = await createTestGame({ main: Scene, seed: 1 })
    g.scene.add(new Particles2D({ amount, lifetime: 1, speedMin: 50, speedMax: 300, gravity: v(0, 200), damping: 1, position: v(375, 600) }))
    g.step(120) // 热身、填满
    const t0 = performance.now()
    g.step(600)
    rows.push(`${String(amount).padStart(9)} | ${((performance.now() - t0) / 600).toFixed(3)}`)
  }
  console.log(rows.join('\n'))
})
