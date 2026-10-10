// #region example
import { Ease, Node2D, Particles2D, Scene, Sprite2D, tex, v, type Vector2 } from 'sapling2d'

export class Arena extends Scene {
  // glow.png：白色、中心亮边缘透明的圆，用 selfModulate 染色
  static override assets = { glow: tex('glow.png'), spark: tex('spark.png') }
  /** 所有发光特效的父节点：设一次 'add'，下面的光圈和火花都叠加发光；挨在一起绘制也更容易合批。 */
  fx!: Node2D

  override ready() {
    this.fx = this.add(new Node2D({ name: 'Fx', blendMode: 'add', zIndex: 100 }))
  }

  /** 爆炸：一个放大淡出的光圈 + 一把火花。叠在怪物上会把它照亮，而不是盖上一层不透明的橙色。 */
  explode(at: Vector2) {
    const glow = this.fx.add(new Sprite2D({ texture: Arena.assets.glow, position: at, scale: v(0.5, 0.5), selfModulate: 0xff9030 }))
    glow.createTween().to(glow, { scale: v(2.5, 2.5), alpha: 0 }, 0.3, Ease.QuadOut).call(() => glow.queueFree())
    const sparks = this.fx.add(
      new Particles2D({ texture: Arena.assets.spark, position: at, emitting: false, amount: 12, lifetime: 0.3, speedMin: 150, speedMax: 350, alphaEnd: 0, selfModulate: 0xffd060 }),
    )
    sparks.emit()
    sparks.finished.connect(() => sparks.queueFree())
  }
}
// #endregion

// #region test
import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('blend mode', async () => {
  const g = await createTestGame({ main: Arena })
  g.scene.explode(v(375, 600))
  g.step()
  expect(g.dump()).toContain('Fx (Node2D) position=(0, 0) zIndex=100 blendMode=add')
  const glow = g.scene.fx.children[0] as Sprite2D
  expect(glow.blendMode).toBe('inherit') // 子节点跟随父节点：实际按 'add' 绘制
  g.stepSeconds(0.5)
  expect(g.scene.fx.children).toHaveLength(0) // 光圈淡出、火花散完后都删掉了
})
// #endregion
