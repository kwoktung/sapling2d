// #region example
import { circle, CollisionShape2D, rectangle, RigidBody2D, Scene, StaticBody2D, v, type Vector2 } from 'sapling2d'

class Ball extends RigidBody2D {
  constructor(
    readonly level: number,
    position: Vector2,
  ) {
    super({ position, bounce: 0.2 }) // 单位：像素、px/s；重力默认 (0, 980)
    this.add(new CollisionShape2D({ shape: circle(20 + level * 10) }))
  }

  override ready() {
    // 接触信号在物理步结束后触发：回调里可以安全地 queueFree / add
    this.bodyEntered.connect((other) => {
      if (!(other instanceof Ball) || other.level !== this.level) return
      if (this.isQueuedForDeletion || other.isQueuedForDeletion) return // 两边都会收到信号：只处理一次
      this.queueFree()
      other.queueFree()
      this.parent!.add(new Ball(this.level + 1, this.position.lerp(other.position, 0.5)))
    }, this)
  }
}

export class Box extends Scene {
  override ready() {
    const floor = this.add(new StaticBody2D({ position: v(375, 1250) }))
    floor.add(new CollisionShape2D({ shape: rectangle(750, 100) })) // 上表面 y = 1200
    this.add(new Ball(0, v(375, 1100)))
    this.add(new Ball(0, v(380, 900)))
  }
}
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('physics merge', async () => {
  const g = await createTestGame({ main: Box })
  g.stepSeconds(2)
  const balls = g.scene.children.filter((c): c is Ball => c instanceof Ball)
  expect(balls.map((b) => b.level)).toEqual([1])
  expect(balls[0]!.y).toBeCloseTo(1200 - 30, 0)
  // #region test
  // 给 position 赋值等于瞬移（速度清零）；施加冲量：ball.applyCentralImpulse(v(200, 0))
  balls[0]!.position = v(100, 500)
  g.step()
  expect(balls[0]!.x).toBeCloseTo(100)
  // #endregion
})
