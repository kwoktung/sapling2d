// #region example
import { Particles2D, Scene, tex, v, type Vector2 } from 'sapling2d'

export class Arena extends Scene {
  static override assets = { spark: tex('spark.png'), smoke: tex('smoke.png') }

  override ready() {
    // 持续发射：跟着角色的烟（localCoords 默认 false：烟留在原地，角色跑开后形成拖尾）
    this.add(
      new Particles2D({ name: 'Smoke', texture: Arena.assets.smoke, position: v(375, 900), amount: 40, lifetime: 0.8,
        direction: -Math.PI / 2, spread: 0.3, speedMin: 40, speedMax: 80, scaleStart: 0.5, scaleEnd: 1.5, alphaEnd: 0 }),
    )
  }

  /** 刀碰刀的火花：一次性爆发，全部消失后删掉发射器。 */
  sparks(at: Vector2) {
    const fx = this.add(
      new Particles2D({ name: 'Sparks', texture: Arena.assets.spark, position: at, emitting: false, amount: 14, lifetime: 0.35,
        lifetimeRandomness: 0.4, speedMin: 250, speedMax: 500, damping: 5, scaleStart: 1, scaleEnd: 0.2, alphaEnd: 0, selfModulate: 0xffd060 }),
    )
    fx.emit()
    fx.finished.connect(() => fx.queueFree())
  }
}
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('particles', async () => {
  const g = await createTestGame({ main: Arena, seed: 1 })
  // #region test
  g.scene.sparks(v(375, 600))
  g.step()
  expect(g.dump()).toMatch(/Sparks \(Particles2D\) position=\(375, 600\).* particles=14/)
  g.stepSeconds(0.5)
  expect(g.dump()).not.toContain('Sparks') // 火花散完，发射器删掉了
  expect(g.dump()).toMatch(/Smoke \(Particles2D\).*emitting=true particles=\d+/)
  // #endregion
})
