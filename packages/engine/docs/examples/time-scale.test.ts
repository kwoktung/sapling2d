// #region example
import { Node2D, Scene, v } from 'sapling2d'

class Blade extends Node2D {
  override process(dt: number) {
    this.rotation += 6 * dt // dt 是乘过 timeScale 的游戏时间：停顿时为 0
  }
}

export class Duel extends Scene {
  blade!: Blade

  override ready() {
    this.blade = this.add(new Blade({ position: v(375, 667) }))
  }

  /** 打击停顿：游戏时间停住一小会儿，再按真实时间恢复（停顿时普通计时器也停了，所以用 ignoreTimeScale）。 */
  async hitStop(seconds: number) {
    this.tree.timeScale = 0
    await this.tree.createTimer(seconds, { ignoreTimeScale: true }).timeout
    this.tree.timeScale = 1
  }

  /** 慢动作：击杀 Boss 时放慢到 0.25 倍，半秒（真实时间）后恢复。 */
  async slowMotion() {
    this.tree.timeScale = 0.25
    await this.tree.createTimer(0.5, { ignoreTimeScale: true }).timeout
    this.tree.timeScale = 1
  }
}
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('time-scale', async () => {
  const g = await createTestGame({ main: Duel })
  // #region test
  const settle = () => new Promise((r) => setTimeout(r, 0)) // 像真实的帧之间一样，让 await 跑一轮
  const blade = g.scene.blade
  void g.scene.hitStop(0.1)
  await settle()
  const r0 = blade.rotation
  g.step(3)
  expect(blade.rotation).toBe(r0) // 停顿中
  g.step(3) // 真实时间 0.1 秒
  await settle()
  expect(g.tree.timeScale).toBe(1)
  g.step(60)
  expect(blade.rotation - r0).toBeCloseTo(6, 0) // 恢复后照常转
  // #endregion
})
