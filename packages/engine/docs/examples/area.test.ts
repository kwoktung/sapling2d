// #region example
import { Area2D, circle, CollisionShape2D, rectangle, RigidBody2D, Scene, v } from 'sapling2d'

export class Goal extends Scene {
  scored = 0

  override ready() {
    // 区域：只检测 RigidBody2D 进出，不挡住它们
    const zone = this.add(new Area2D({ position: v(375, 800) }))
    zone.add(new CollisionShape2D({ shape: rectangle(300, 40) }))
    zone.bodyEntered.connect(() => this.scored++, this)

    const ball = this.add(new RigidBody2D({ position: v(375, 500) }))
    ball.add(new CollisionShape2D({ shape: circle(20) }))
  }
}
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('area', async () => {
  const g = await createTestGame({ main: Goal })
  g.stepSeconds(1.5)
  expect(g.scene.scored).toBe(1)
})
