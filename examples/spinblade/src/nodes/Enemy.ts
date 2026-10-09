import { ASSETS } from '../assets'
import { ENEMY, RING } from '../config'
import { Fighter, type FighterOptions } from './Fighter'
import type { Knife } from './Knife'

/** 敌人看得到的东西（场地实现）。 */
export interface EnemyWorld {
  /** 玩家；死了是 null。 */
  readonly player: Fighter | null
  readonly groundKnives: readonly Knife[]
}

export type EnemyState = 'wander' | 'chase' | 'flee' | 'collect'

/**
 * 敌人：每隔一小会儿决定做什么——
 * - 看得到玩家：刀不比玩家少太多就追，少太多（或者没有刀）就逃；
 * - 看不到玩家但看得到地上的刀：去捡；
 * - 都没有：随便走走，撞墙就换方向。
 */
export class Enemy extends Fighter {
  state: EnemyState = 'wander'
  /** 站着不动、不做决定（测试和演示用）。 */
  passive = false
  protected readonly world: EnemyWorld
  protected speed: number = ENEMY.speed
  private _thinkLeft = 0
  private _wanderLeft = 0
  private _dirX = 0
  private _dirY = 0

  constructor(world: EnemyWorld, x: number, y: number, options: Partial<FighterOptions> = {}) {
    super({ name: 'Enemy', texture: ASSETS.enemy, x, y, spin: -RING.spin, hp: ENEMY.hp, healthBar: true, ...options })
    this.world = world
  }

  protected think(): void {
    if (this.passive) {
      this.moveX = 0
      this.moveY = 0
      return
    }
    const dt = this.tree.physicsDelta
    this._thinkLeft -= dt
    if (this._thinkLeft <= 0) {
      this._thinkLeft = ENEMY.thinkInterval
      this.decide()
    }
    if (this.state === 'wander') {
      this._wanderLeft -= dt
      if (this._wanderLeft <= 0 || this.isOnWall) this._newWanderDir()
    }
    this.moveX = this._dirX * this.speed
    this.moveY = this._dirY * this.speed
  }

  /** 选状态和方向。 */
  protected decide(): void {
    const player = this.world.player
    if (player && !player.dead) {
      const dx = player.x - this.x
      const dy = player.y - this.y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < ENEMY.sight && d > 0) {
        const weaker = this.knives.length === 0 || this.knives.length + ENEMY.fleeMargin <= player.knives.length
        this.state = weaker ? 'flee' : 'chase'
        const sign = weaker ? -1 : 1
        this._dirX = (sign * dx) / d
        this._dirY = (sign * dy) / d
        return
      }
    }
    const knife = this._nearestKnife()
    if (knife) {
      this.state = 'collect'
      const dx = knife.x - this.x
      const dy = knife.y - this.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      this._dirX = dx / d
      this._dirY = dy / d
      return
    }
    if (this.state !== 'wander') {
      this.state = 'wander'
      this._newWanderDir()
    }
  }

  /** 掉头（朝反方向走）。 */
  protected reverse(): void {
    this._dirX = -this._dirX
    this._dirY = -this._dirY
  }

  private _nearestKnife(): Knife | null {
    const knives = this.world.groundKnives
    let best: Knife | null = null
    let bestD = ENEMY.knifeSight * ENEMY.knifeSight
    for (let i = 0; i < knives.length; i++) {
      const k = knives[i]!
      if (k.dead) continue
      const dx = k.x - this.x
      const dy = k.y - this.y
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = k
      }
    }
    return best
  }

  private _newWanderDir(): void {
    const rng = this.tree.rng
    const a = rng.randfRange(0, Math.PI * 2)
    this._dirX = Math.cos(a)
    this._dirY = Math.sin(a)
    this._wanderLeft = rng.randfRange(ENEMY.wanderMin, ENEMY.wanderMax)
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), state: this.passive ? 'passive' : this.state }
  }
}
