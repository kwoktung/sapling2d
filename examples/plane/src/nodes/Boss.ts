import { Sprite2D, v, type Tween, type Vector2 } from 'sapling2d'
import { ASSETS } from '../assets'
import { BOSS } from '../config'
import { bounds } from './bounds'
import type { EnemyHost } from './Enemy'

/** 从屏幕上方多高的地方开始入场。 */
const ENTER_FROM = -160

/**
 * Boss：从上方飞入（期间打不动），到位后左右摆动，按剩余血量切换三种弹幕：
 * 1. 瞄准玩家的三连扇形 + 两侧炮管直射；2. 旋转螺旋；3. 环形弹幕 + 五连扇形。
 */
export class Boss extends Sprite2D {
  readonly maxHp: number
  readonly hitShape = BOSS.hitShape
  hp: number
  dead = false
  private readonly _host: EnemyHost
  private _age = 0
  private _entering = true
  private _homeX = 375
  private _homeY = 0
  private _startY = 0
  /** 各种弹幕的冷却（秒）。 */
  private _aimIn = 1
  private _sideIn = 1.6
  private _spiralIn = 0
  private _spiralAngle = 0
  private _ringIn = 0.8
  private _flash: Tween | null = null

  constructor(maxHp: number, host: EnemyHost) {
    super({ name: 'Boss', texture: ASSETS.sprites.get('boss') })
    this.maxHp = this.hp = maxHp
    this._host = host
  }

  override ready() {
    this._homeX = (bounds.left + bounds.right) / 2
    this._homeY = bounds.top + BOSS.hoverY
    this._startY = bounds.top + ENTER_FROM
    this.position = v(this._homeX, this._startY)
  }

  /** 还在入场（打不动、不射击）。 */
  get entering(): boolean {
    return this._entering
  }

  /** 1–3，按剩余血量。 */
  get phase(): number {
    const ratio = this.hp / this.maxHp
    return ratio < BOSS.phase3Below ? 3 : ratio < BOSS.phase2Below ? 2 : 1
  }

  override process(dt: number) {
    this._age += dt
    if (this._entering) {
      const t = Math.min(1, this._age / BOSS.enterSeconds)
      this.y = this._startY + (this._homeY - this._startY) * (1 - (1 - t) ** 3) // 减速停下
      if (t >= 1) {
        this._entering = false
        this._age = 0
      }
      return
    }
    // 左右摆动，限制在屏幕内
    const sway = Math.min(BOSS.sway, (bounds.right - bounds.left) / 2 - BOSS.halfWidth)
    this.x = this._homeX + Math.sin(this._age * BOSS.swayHz * Math.PI * 2) * sway
    this.y = this._homeY + Math.sin(this._age * 0.7) * 20
    this._attack(dt)
  }

  /** 受到伤害；入场中免疫。返回是否被击毁。 */
  hit(damage: number): boolean {
    if (this._entering || this.dead) return false
    this.hp = Math.max(0, this.hp - damage)
    this._flash?.kill()
    this.modulate = 0xff9090
    this._flash = this.createTween().to(this as Boss, { modulate: 0xffffff }, 0.1)
    return this.hp <= 0
  }

  kill() {
    if (this.dead) return
    this.dead = true
    this.queueFree()
  }

  private _attack(dt: number) {
    const phase = this.phase
    if (phase === 1) {
      if ((this._aimIn -= dt) <= 0) {
        this._aimIn += 1.1
        this._fan(3, 0.16, 360)
      }
      if ((this._sideIn -= dt) <= 0) {
        this._sideIn += 1.8
        for (const dx of [-110, 110]) this._shoot(v(this.x + dx, this.y + 90), Math.PI / 2, 420)
      }
    } else if (phase === 2) {
      if ((this._spiralIn -= dt) <= 0) {
        this._spiralIn += 0.07
        this._spiralAngle += 0.33
        for (const offset of [0, Math.PI]) this._shoot(this._muzzle(), this._spiralAngle + offset, 250, 70)
      }
    } else {
      if ((this._ringIn -= dt) <= 0) {
        this._ringIn += 1.3
        const shift = this._age * 0.5 // 每一圈错开一点，留出不同的缝
        for (let i = 0; i < 16; i++) this._shoot(this._muzzle(), shift + (i / 16) * Math.PI * 2, 230, 70)
      }
      if ((this._aimIn -= dt) <= 0) {
        this._aimIn += 0.9
        this._fan(5, 0.14, 400)
      }
    }
  }

  private _muzzle(): Vector2 {
    return v(this.x, this.y + 40)
  }

  /** 瞄准玩家的扇形：n 发，相邻夹角 step。 */
  private _fan(n: number, step: number, speed: number) {
    const from = this._muzzle()
    const p = this._host.player
    const aim = Math.atan2(p.y - from.y, p.x - from.x)
    for (let i = 0; i < n; i++) this._shoot(from, aim + (i - (n - 1) / 2) * step, speed)
  }

  /** 沿 angle 方向发射；`offset` 让子弹从离中心这么远的地方出现（四面八方的弹幕不要堆在机身上）。 */
  private _shoot(from: Vector2, angle: number, speed: number, offset = 0) {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    this._host.spawnEnemyBullet(offset ? v(from.x + cos * offset, from.y + sin * offset) : from, v(cos * speed, sin * speed), 'boss')
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), hp: this.hp, phase: this.phase, entering: this._entering || undefined }
  }
}
