// #region example
import { Curve2D, Scene, Sprite2D, tex, v } from 'sapling2d'

// 路线：平滑经过这几个点（也可以来自 Tiled 的折线对象：o.points 加上 o.x / o.y）
const ROUTE = Curve2D.catmullRom([v(100, -40), v(550, 250), v(200, 650), v(500, 1000), v(375, 1300)])

class Walker extends Sprite2D {
  speed = 160 // 像素/秒：按弧长前进，弯道上也是匀速
  dist = 0
  private readonly _p = { x: 0, y: 0 } // 复用：每帧不分配

  override process(dt: number) {
    this.dist += this.speed * dt
    ROUTE.sample(this.dist, this._p)
    this.x = this._p.x
    this.y = this._p.y
    this.flipH = Math.cos(ROUTE.angleAt(this.dist)) < 0 // 往左走时翻转；要转向就写 rotation = angleAt(...)
    if (this.dist >= ROUTE.length) this.queueFree() // 走到终点
  }
}

export class Field extends Scene {
  static override assets = { enemy: tex('enemy.png') }
  walker!: Walker

  override ready() {
    this.walker = this.add(new Walker({ texture: Field.assets.enemy }))
  }
}
// #endregion

// #region test
import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('curve', async () => {
  const g = await createTestGame({ main: Field })
  const w = g.scene.walker
  g.stepSeconds(2)
  expect(w.dist).toBeCloseTo(320)
  const p = ROUTE.sample(320, { x: 0, y: 0 })
  expect([w.x, w.y]).toEqual([expect.closeTo(p.x), expect.closeTo(p.y)])
  g.stepSeconds(ROUTE.length / 160)
  expect(w.isFreed).toBe(true) // 走完全程
})
// #endregion
