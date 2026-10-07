// #region example
import { Ease, Label, Scene, Timer, v } from 'sapling2d'

export class Countdown extends Scene {
  left = 3
  label!: Label

  override ready() {
    this.label = this.add(new Label({ text: '3', fontSize: 120, align: 'center', verticalAlign: 'center', position: v(375, 667) }))
    const timer = this.add(new Timer({ waitTime: 1, autostart: true })) // 循环触发，不漂移
    timer.timeout.connect(() => this.tick(timer), this)
  }

  tick(timer: Timer) {
    this.left--
    this.label.text = this.left > 0 ? String(this.left) : 'GO!'
    // 补间：绑定到节点，节点销毁时自动停止；同一个 to() 里的多个属性同时进行
    this.label.scale = v(1.6, 1.6)
    this.label.createTween().to(this.label, { scale: v(1, 1) }, 0.3, Ease.BackOut)
    if (this.left === 0) timer.stop()
  }
}
// 一次性等待不需要节点：await this.tree.createTimer(0.5).timeout
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('timer and tween', async () => {
  const g = await createTestGame({ main: Countdown })
  g.stepSeconds(3.5)
  expect(g.scene.label.text).toBe('GO!')
  expect(g.scene.label.scale.x).toBeCloseTo(1)
})
