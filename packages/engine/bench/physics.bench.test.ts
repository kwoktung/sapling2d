/**
 * 物理性能基准：模拟 spike 01 的压测（每 0.2 秒生成一个球，直到 150 个），记录单步物理耗时。
 *
 * 运行：pnpm bench:physics          （有 JIT，参照桌面浏览器 / Android）
 *      pnpm bench:physics:jitless  （无 JIT，近似 iOS 小游戏，见 spikes/wechat/REPORT.md 第 8 节）
 *
 * 不做断言：耗时依赖机器。用来比较改动前后的变化。
 */
import { it } from 'vitest'
import { circle, CollisionShape2D, rectangle, RigidBody2D, Scene, StaticBody2D, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

it('150 个圆形刚体堆叠：单步物理耗时', async () => {
  const W = 750
  const H = 1334
  const g = await createTestGame({ main: Scene, seed: 1 })
  const wall = (x: number, y: number, w: number, h: number) => {
    const s = g.scene.add(new StaticBody2D({ position: v(x, y) }))
    s.add(new CollisionShape2D({ shape: rectangle(w, h) }))
  }
  wall(W / 2, H + 50, W * 2, 100)
  wall(-50, H / 2, 100, H * 2)
  wall(W + 50, H / 2, 100, H * 2)

  const physics = g.tree.physics
  const rows: string[] = []
  let bodies = 0
  let total = 0
  let steps = 0
  const jitless = process.execArgv.includes('--jitless')
  for (let frame = 1; frame <= 60 * 50; frame++) {
    if (frame > 180 && bodies < 150 && frame % 12 === 0) {
      const b = g.scene.add(new RigidBody2D({ position: v(40 + g.tree.rng.randf() * (W - 80), 140), friction: 0.4, bounce: 0.15 }))
      b.add(new CollisionShape2D({ shape: circle(18 + g.tree.rng.randf() * 22) }))
      bodies++
    }
    const t = performance.now()
    g.step()
    total += performance.now() - t
    steps++
    if (frame % 300 === 0) {
      rows.push(`t=${String(frame / 60).padStart(2)}s  bodies=${String(physics.bodyCount - 3).padStart(3)}  ms/frame=${(total / steps).toFixed(2)}`)
      total = 0
      steps = 0
    }
  }
  console.log(`\nphysics benchmark (${jitless ? 'jitless' : 'jit'})\n` + rows.join('\n'))
}, 600_000)
