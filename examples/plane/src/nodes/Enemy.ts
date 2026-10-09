import { Sprite2D, v, type CircleShape2D, type Tween, type Vector2 } from 'sapling2d'
import { ASSETS } from '../assets'
import { ENEMIES, ENEMY_SHAPES, type EnemyConfig, type EnemyKind } from '../config'
import { bounds } from './bounds'

/** 敌机需要从战场拿到的东西：玩家位置（瞄准用）和发射子弹。 */
export interface EnemyHost {
  readonly player: { readonly x: number; readonly y: number }
  /** `style`：普通敌方子弹，或 Boss 的大号子弹。 */
  spawnEnemyBullet(position: Vector2, velocity: Vector2, style?: 'normal' | 'boss'): void
}

/** 大型飞机悬停多久后离开。 */
const HOVER_SECONDS = 10

/** 敌机：向下飞（可以左右摆动、悬停），按配置射击；被击中闪红。 */
export class Enemy extends Sprite2D {
  readonly kind: EnemyKind
  readonly config: EnemyConfig
  readonly maxHp: number
  readonly radius: number
  readonly hitShape: CircleShape2D
  hp: number
  dead = false
  /** 关掉射击（测试用）。 */
  fireEnabled = true
  private readonly _host: EnemyHost
  private readonly _baseX: number
  private _age = 0
  private _hoverTime = 0
  private _fireIn: number
  private _flash: Tween | null = null

  constructor(kind: EnemyKind, position: Vector2, host: EnemyHost) {
    const config = ENEMIES[kind]
    super({ name: `Enemy_${kind}`, texture: ASSETS.sprites.get(config.frame), position })
    this.kind = kind
    this.config = config
    this.maxHp = this.hp = config.hp
    this.radius = config.radius
    this.hitShape = ENEMY_SHAPES[kind]
    this._host = host
    this._baseX = position.x
    this._fireIn = config.fire?.firstDelay ?? Infinity
  }

  override process(dt: number) {
    const c = this.config
    this._age += dt
    const hovering = c.hoverAt !== null && this.y >= bounds.top + c.hoverAt && this._hoverTime < HOVER_SECONDS
    if (hovering) this._hoverTime += dt
    else this.y += c.speed * dt
    if (c.sway) this.x = this._baseX + Math.sin(this._age * c.swayHz * Math.PI * 2) * c.sway

    if (c.fire && this.fireEnabled && (this._fireIn -= dt) <= 0) {
      this._fireIn += c.fire.interval
      this._fire(c.fire)
    }
    if (this.y > bounds.bottom + this.radius + 40) this.kill() // 飞出屏幕：不得分
  }

  /** 受到伤害；返回是否被击毁。 */
  hit(damage: number): boolean {
    this.hp -= damage
    this._flash?.kill()
    this.modulate = 0xff7070
    this._flash = this.createTween().to(this as Enemy, { modulate: 0xffffff }, 0.15)
    return this.hp <= 0
  }

  kill() {
    if (this.dead) return
    this.dead = true
    this.queueFree()
  }

  private _fire(fire: NonNullable<EnemyConfig['fire']>) {
    const muzzle = v(this.x, this.y + this.radius * 0.6)
    if (fire.pattern === 'aimed') {
      const p = this._host.player
      const angle = Math.atan2(p.y - muzzle.y, p.x - muzzle.x)
      this._host.spawnEnemyBullet(muzzle, v(Math.cos(angle) * fire.speed, Math.sin(angle) * fire.speed))
    } else {
      for (let i = -2; i <= 2; i++) {
        const angle = Math.PI / 2 + i * 0.22
        this._host.spawnEnemyBullet(muzzle, v(Math.cos(angle) * fire.speed, Math.sin(angle) * fire.speed))
      }
    }
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), hp: this.hp }
  }
}
