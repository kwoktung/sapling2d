// #region example
import { Ease, Scene, Sprite2D, tex, v, type Tween } from 'sapling2d'

class Enemy extends Sprite2D {
  hp = 3
  private _flashTween: Tween | null = null

  hit() {
    this.hp--
    // 闪白：整个形状变成白色，再淡回原样（modulate 只能变暗，做不出这个效果）
    this._flashTween?.kill()
    this.flash = 1
    this._flashTween = this.createTween().to(this as Enemy, { flash: 0 }, 0.12, Ease.QuadOut) // 子类的属性：to(this as 类名, …)
  }

  /** 中毒：闪绿色。 */
  poison() {
    this.flashColor = 0x60ff60
    this.flash = 0.6
  }
}

export class Arena extends Scene {
  static override assets = { enemy: tex('enemy.png') }
  enemy!: Enemy

  override ready() {
    this.enemy = this.add(new Enemy({ texture: Arena.assets.enemy, position: v(375, 400) }))
  }
}
// #endregion

// #region test
import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('flash', async () => {
  const g = await createTestGame({ main: Arena })
  const enemy = g.scene.enemy
  enemy.hit()
  expect(enemy.flash).toBe(1)
  g.step(3)
  expect(enemy.flash).toBeGreaterThan(0)
  expect(enemy.flash).toBeLessThan(1)
  g.stepSeconds(0.2)
  expect(enemy.flash).toBe(0) // 淡回原样
  enemy.poison()
  expect(g.dump()).toContain('flash=0.6 flashColor=#60ff60')
})
// #endregion
