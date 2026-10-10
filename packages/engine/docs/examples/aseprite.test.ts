// #region example
import { AnimatedSprite2D, aseprite, Node2D, Scene, v } from 'sapling2d'
// Aseprite 导出的 JSON 直接 import 进代码；图片放在 public/assets/
import heroData from './hero.json'

class Hero extends Node2D {
  static readonly HIT_FRAME = 2 // attack 动画里出手的那一帧（动画里的序号，从 0 开始）
  shots: { x: number; y: number }[] = [] // 子弹的发射点（演示用）
  sprite!: AnimatedSprite2D<'idle' | 'attack'>

  override ready() {
    const sheet = Arena.assets.hero
    this.sprite = this.add(
      new AnimatedSprite2D({
        // tag → 动画，每帧时长来自 Aseprite；attack 只播一次
        animations: sheet.animations({ attack: { loop: false } }),
        autoplay: true,
      }),
    )
    this.sprite.frameChanged.connect(() => {
      if (this.sprite.animation !== 'attack' || this.sprite.frame !== Hero.HIT_FRAME) return
      // 挂点：当前帧里 muzzle slice 的 pivot（以精灵中心为原点）；传 sprite.texture，不是 sprite.frame
      const muzzle = sheet.slice('muzzle', this.sprite.texture)!.pivot!
      const dx = this.sprite.flipH ? -muzzle.x : muzzle.x // 精灵翻转时 x 取反
      this.shots.push({ x: this.x + dx, y: this.y + muzzle.y })
    }, this)
    this.sprite.animationFinished.connect(() => this.sprite.play('idle'), this)
  }

  attack() {
    this.sprite.play('attack')
  }
}

export class Arena extends Scene {
  // 类型参数是 tag 的名字（从 JSON 推断不出来）；用到不存在的 tag 时运行时报错
  static override assets = { hero: aseprite<'idle' | 'attack'>('hero.png', heroData) }
  hero!: Hero

  override ready() {
    this.hero = this.add(new Hero({ position: v(375, 1000) }))
  }
}
// #endregion

// #region test
import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('aseprite', async () => {
  const g = await createTestGame({ main: Arena })
  const hero = g.scene.hero
  expect(hero.sprite.getAnimationDuration('attack')).toBeCloseTo(0.5) // 100 + 200 + 40 + 160 毫秒
  hero.attack()
  g.stepSeconds(0.31) // 前摇 0.3 秒之后出手
  expect(hero.shots).toEqual([{ x: 375 + 16, y: 1000 - 16 }]) // 画布 48×48：pivot (40, 8) 相对中心 (24, 24)
  g.stepSeconds(0.2)
  expect(hero.sprite.animation).toBe('idle')
})
// #endregion
