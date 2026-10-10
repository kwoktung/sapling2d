import { ColorRect, Node2D, Sprite2D, v } from 'sapling2d'
import { ASSETS } from '../assets'
import { ENEMY } from '../config'
import type { CurvePath } from '../path'

/**
 * 怪物：沿 CurvePath 匀速前进（按弧长）。`dist` 是走过的距离，`remaining` 越小越靠近底线（英雄优先打它）。
 * 受击时闪白（`Sprite2D.flash`）、沿路径往回推一点；头顶血条。
 */
export class Enemy extends Node2D {
  readonly body = new Sprite2D({ texture: ASSETS.enemy })
  readonly barBack = new ColorRect({ size: v(ENEMY.barWidth, ENEMY.barHeight), color: 0x301818, position: v(-ENEMY.barWidth / 2, -40), visible: false })
  readonly barFill = new ColorRect({ size: v(ENEMY.barWidth, ENEMY.barHeight), color: 0x60d060 })
  dist = 0
  hp: number
  dead = false
  /** 走到底线了（Battle 扣命后移除）。 */
  leaked = false
  private _flashLeft = 0
  /** 复用的采样结果：每帧不分配。 */
  private readonly _p = { x: 0, y: 0, dirX: 0 }

  constructor(
    readonly path: CurvePath,
    readonly maxHp: number,
    public speed: number,
    readonly reward: number,
  ) {
    super()
    this.hp = maxHp
    this.add(this.body)
    this.add(this.barBack)
    this.barBack.add(this.barFill)
    this._move(0)
  }

  get remaining(): number {
    return this.path.length - this.dist
  }

  override process(dt: number) {
    if (this.dead) return
    this._move(this.speed * dt)
    if (this._flashLeft > 0) {
      this._flashLeft = Math.max(0, this._flashLeft - dt)
      this.body.flash = this._flashLeft / ENEMY.flashTime // 1 → 0 淡出
    }
    if (this.dist >= this.path.length) this.leaked = true
  }

  /** 扣血；返回是否被这一下打死。 */
  damage(amount: number): boolean {
    if (this.dead) return false
    this.hp -= amount
    this.body.flash = 1
    this._flashLeft = ENEMY.flashTime
    this._move(-ENEMY.knockback)
    this.barBack.visible = true
    this.barFill.scale = v(Math.max(0, this.hp / this.maxHp), 1)
    if (this.hp > 0) return false
    this.dead = true
    return true
  }

  private _move(delta: number) {
    this.dist = Math.max(0, this.dist + delta)
    const p = this._p
    this.path.sample(this.dist, p)
    this.x = p.x
    this.y = p.y
    if (p.dirX !== 0) this.body.flipH = p.dirX < 0
    // 引擎缺口（验证清单 ySort）：下面的怪画在上面，每帧手动设 zIndex
    this.zIndex = p.y
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), hp: Math.round(this.hp), dist: Math.round(this.dist) }
  }
}
