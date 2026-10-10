import { AnimatedSprite2D, Node2D, v, type Vector2 } from 'sapling2d'
import { ASSETS } from '../assets'
import { ATTACK, type HeroKind, type HeroStats } from '../skills'
import type { Enemy } from './Enemy'

/** 英雄需要的场景接口（Battle 实现）：找目标、出手。 */
export interface HeroWorld {
  stats: Record<HeroKind, HeroStats>
  /** 射程内最靠近底线的怪物（没有时为 null）。 */
  findTarget(x: number, y: number, range: number): Enemy | null
  /** 出手帧：按英雄种类发射箭 / 火球 / 斩击。 */
  strike(hero: Hero, target: Enemy): void
}

/**
 * 英雄：站在槽位上，冷却好了就对射程内最靠近底线的怪物攻击。
 * 攻击动画的每帧时长不同（ATTACK.durations）；伤害在出手帧（frameChanged 里按帧号判断）结算，
 * 出手前目标死了就换一个，射程内没有就打空。攻击间隔比动画短时用 speedScale 加速。
 */
export class Hero extends Node2D {
  readonly sprite: AnimatedSprite2D<'idle' | 'attack'>
  cooldown = 0
  target: Enemy | null = null
  attacks = 0

  constructor(
    private readonly world: HeroWorld,
    readonly kind: HeroKind,
    position: Vector2,
  ) {
    super({ position, zIndex: position.y })
    const frames = ASSETS[kind].frames()
    this.sprite = this.add(
      new AnimatedSprite2D({
        animations: {
          idle: { frames: frames.slice(0, 2), fps: 3 },
          attack: { frames: frames.slice(2, 6), durations: ATTACK.durations, loop: false },
        },
        autoplay: true,
        position: v(0, -20), // 身体画在槽位中心偏上一点
      }),
    )
  }

  get stats(): HeroStats {
    return this.world.stats[this.kind]
  }

  override ready() {
    this.sprite.frameChanged.connect(this._onFrame, this)
    this.sprite.animationFinished.connect(this._onFinished, this)
  }

  override process(dt: number) {
    this.cooldown -= dt
    if (this.cooldown > 0 || this.sprite.animation === 'attack') return
    const target = this.world.findTarget(this.x, this.y, this.stats.range)
    if (!target) return
    this.target = target
    this.cooldown = this.stats.interval
    this.sprite.flipH = target.x < this.x
    // 攻击间隔比动画短时加速播放，保证下一次攻击前播完
    this.sprite.speedScale = Math.max(1, this.sprite.getAnimationDuration('attack') / this.stats.interval)
    this.sprite.play('attack')
  }

  private readonly _onFrame = () => {
    if (this.sprite.animation !== 'attack' || this.sprite.frame !== ATTACK.hitFrame) return
    let target = this.target
    if (!target || target.dead || target.leaked) target = this.world.findTarget(this.x, this.y, this.stats.range * 1.1)
    this.target = null
    if (!target) return // 打空
    this.attacks++
    this.world.strike(this, target)
  }

  private readonly _onFinished = () => {
    this.sprite.speedScale = 1
    this.sprite.play('idle')
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), kind: this.kind, attacks: this.attacks }
  }
}
