/**
 * 弹幕剖析（500 颗）：按阶段的每帧耗时 + 基本操作的单次耗时。和真机（spikes/bullets，?profile 模式）的输出对照着看。
 *
 * 运行：pnpm bench:bullets:profile          （有 JIT）
 *      pnpm bench:bullets:profile:jitless  （无 JIT，近似 iOS 小游戏）
 */
import { it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'
import { PixiRenderer } from '../src/render/PixiRenderer'
import { formatMicro, instrument, micro, perFrame } from './bullets-profile'
import { BulletStorm, config } from './bullets-scene'

it('弹幕剖析：阶段耗时与基本操作', async () => {
  const jitless = process.execArgv.includes('--jitless')
  const clock = () => performance.now()
  config.bullets = 500
  const g = await createTestGame({ main: BulletStorm, seed: 1 })
  const r = PixiRenderer._createForSyncTests()
  const frame = () => {
    g.step()
    r.sync(g.tree)
  }
  for (let i = 0; i < 120; i++) frame()

  // 基线：不包装
  const FRAMES = 300
  let logic = 0
  let sync = 0
  for (let i = 0; i < FRAMES; i++) {
    const t0 = clock()
    g.step()
    const t1 = clock()
    r.sync(g.tree)
    logic += t1 - t0
    sync += clock() - t1
  }

  const inst = instrument(clock)
  inst.reset()
  for (let i = 0; i < FRAMES; i++) frame()
  const phases = perFrame(inst, FRAMES)
  inst.restore()

  const rows = formatMicro(micro(clock, g.tree, r))
  console.log(
    `\nbullets profile (${jitless ? 'jitless' : 'jit'}), 500 bullets\n` +
      `baseline: logic ${(logic / FRAMES).toFixed(2)} ms, sync ${(sync / FRAMES).toFixed(2)} ms\n\n` +
      `phases (instrumented, ms/frame):\n${phases.join('\n')}\n\nmicro (ns/op):\n${rows.join('\n')}`,
  )
}, 600_000)
