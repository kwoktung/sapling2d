import { Sprite2D, type Vector2 } from 'sapling2d'
import { ASSETS } from '../assets'
import { PLAYER, WEAPON } from '../config'

/** 玩家战机：命数、火力等级、受伤后的无敌时间（期间闪烁）。移动和射击由战斗场景驱动。 */
export class Player extends Sprite2D {
  readonly hitShape = PLAYER.hitShape
  lives = PLAYER.lives
  private _power = 1
  private _invincibleLeft = 0
  /** 无敌模式（测试出怪用）：永远不会被击中。 */
  god = false

  constructor(position: Vector2) {
    super({ name: 'Player', texture: ASSETS.sprites.get('player'), position })
  }

  /** 火力等级 1–4。 */
  get power(): number {
    return this._power
  }

  set power(value: number) {
    this._power = Math.max(1, Math.min(WEAPON.maxPower, value))
  }

  get invincible(): boolean {
    return this.god || this._invincibleLeft > 0
  }

  get alive(): boolean {
    return this.lives > 0
  }

  /** 命中判定（HitTester）用：没命了就不再参与碰撞。 */
  get dead(): boolean {
    return this.lives <= 0
  }

  /** 被击中：无敌时忽略并返回 false；否则掉一条命、火力降一级、进入无敌，返回 true。 */
  hurt(): boolean {
    if (this.invincible || !this.alive) return false
    this.lives--
    this.power--
    this._invincibleLeft = PLAYER.invincibleSeconds
    return true
  }

  override process(dt: number) {
    if (this._invincibleLeft <= 0) return
    this._invincibleLeft -= dt
    // 无敌期间闪烁：每 0.1 秒切换一次
    this.alpha = this._invincibleLeft > 0 && Math.floor(this._invincibleLeft * 10) % 2 === 0 ? 0.3 : 1
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), lives: this.lives, power: this._power, invincible: this.invincible || undefined }
  }
}
