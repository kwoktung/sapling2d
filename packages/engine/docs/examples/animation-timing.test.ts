// #region example
import { AnimatedSprite2D, Node2D, Scene, sheet, v } from 'sapling2d'

class Hero extends Node2D {
  static readonly HIT_FRAME = 2 // 出手的那一帧：在这一帧结算伤害、发射弹道
  attackInterval = 1 // 两次攻击之间的秒数，升级攻速时变小
  hits = 0
  sprite!: AnimatedSprite2D<'idle' | 'attack'>

  override ready() {
    const frames = Arena.assets.hero.frames()
    this.sprite = this.add(
      new AnimatedSprite2D({
        animations: {
          idle: { frames: frames.slice(0, 2), fps: 4 },
          // 每帧各自的时长（秒）：前摇停住 0.2 秒，出手帧只有 0.04 秒，收招 0.16 秒
          attack: { frames: frames.slice(2, 6), durations: [0.1, 0.2, 0.04, 0.16], loop: false },
        },
        autoplay: true,
      }),
    )
    // 换帧时检查帧号：speedScale 再大也会逐帧触发，出手帧不会被跳过
    this.sprite.frameChanged.connect(() => {
      if (this.sprite.animation === 'attack' && this.sprite.frame === Hero.HIT_FRAME) this.hits++
    }, this)
    this.sprite.animationFinished.connect(() => this.sprite.play('idle'), this)
  }

  attack() {
    // 攻击间隔比动画（0.5 秒）还短时加速播放，保证下一次攻击前播完
    this.sprite.speedScale = Math.max(1, this.sprite.getAnimationDuration('attack') / this.attackInterval)
    this.sprite.play('attack')
  }

  /** 从开始攻击到出手的秒数（算上加速）：例如让伤害数字、音效对上画面。 */
  get windup(): number {
    return this.sprite.getFrameTime('attack', Hero.HIT_FRAME) / this.sprite.speedScale
  }
}

export class Arena extends Scene {
  // 一张图里 6 帧：0–1 待机，2–5 攻击
  static override assets = { hero: sheet('hero.png', { columns: 6, rows: 1 }) }
  hero!: Hero

  override ready() {
    this.hero = this.add(new Hero({ position: v(375, 1000) }))
  }
}
// #endregion

// #region test
import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('frame durations', async () => {
  const g = await createTestGame({ main: Arena })
  const hero = g.scene.hero
  hero.attack()
  expect(hero.windup).toBeCloseTo(0.3) // 0.1 + 0.2
  g.stepSeconds(0.29)
  expect(hero.hits).toBe(0) // 还在前摇
  g.stepSeconds(0.02)
  expect(hero.hits).toBe(1) // 出手
  g.stepSeconds(0.25)
  expect(hero.sprite.animation).toBe('idle') // 播完回到待机

  hero.attackInterval = 0.25 // 攻速翻倍：动画以 2 倍速播放
  hero.attack()
  expect([hero.sprite.speedScale, hero.windup]).toEqual([2, expect.closeTo(0.15)])
  g.stepSeconds(0.16)
  expect(hero.hits).toBe(2)
})
// #endregion
