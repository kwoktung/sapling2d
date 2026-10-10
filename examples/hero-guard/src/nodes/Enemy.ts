import { ColorRect, Node2D, Sprite2D, v, type Curve2D, type Texture } from 'sapling2d'
import { ENEMY_FEEL } from '../config'
import { ENEMIES, type EnemyKind } from '../data/enemies'

/** 怪物的贴图和脚底到贴图中心的距离（身体节点的原点在脚底）。 */
export interface EnemyLook {
  texture: Texture
  /** 贴图高度的一半：身体精灵往上挪这么多，脚底正好在节点位置。 */
  halfHeight: number
}

/**
 * 怪物：沿自己的 `Curve2D` 匀速前进（`dist` 是走过的距离，`remaining` 越小离城门越近）。
 * 走路是程序化的上下弹跳 + 落地时压扁；按前进方向翻转；受击闪白；受过伤才显示头顶血条。
 */
export class Enemy extends Node2D {
  readonly body: Sprite2D
  readonly barBack: ColorRect
  readonly barFill = new ColorRect({ size: v(ENEMY_FEEL.barWidth, ENEMY_FEEL.barHeight), color: 0x60d060 })
  dist = 0
  hp: number
  dead = false
  /** 中毒：层数、剩余时间、每层每秒伤害、离下一次跳伤害还有多久（Battle 每帧结算）。 */
  poisonStacks = 0
  poisonLeft = 0
  poisonDps = 0
  poisonTick = 0
  /** 减速（比例和剩余时间）、冰冻剩余时间、寒冰质变的计数（2 秒窗口里被打了几次）。 */
  slowPct = 0
  slowLeft = 0
  frozenLeft = 0
  frostHits = 0
  frostWindowStart = -1
  /** 眩晕、嘲讽（骑士）：剩余时间，期间停下。 */
  stunLeft = 0
  tauntLeft = 0
  /** 越过底线了（Battle 扣命后移除）。 */
  leaked = false
  private _flashLeft = 0
  private _hop: number
  /** 脚底到身体贴图中心的距离（已乘缩放）。 */
  private readonly _halfHeight: number
  private readonly _p = { x: 0, y: 0 }

  constructor(
    readonly kind: EnemyKind,
    readonly path: Curve2D,
    readonly maxHp: number,
    look: EnemyLook,
    phase: number,
  ) {
    super()
    const base = ENEMIES[kind]
    this.hp = maxHp
    this._hop = phase
    this.body = this.add(new Sprite2D({ texture: look.texture, position: v(0, -look.halfHeight), scale: v(base.scale, base.scale) }))
    this.barBack = this.add(
      new ColorRect({ size: v(ENEMY_FEEL.barWidth, ENEMY_FEEL.barHeight), color: 0x301818, position: v(-ENEMY_FEEL.barWidth / 2, -look.halfHeight * 2 * base.scale - 14), visible: false }),
    )
    this.barBack.add(this.barFill)
    this._halfHeight = look.halfHeight * base.scale
    this._move(0)
  }

  /** 停下了（冰冻、眩晕、嘲讽）。 */
  get held(): boolean {
    return this.frozenLeft > 0 || this.stunLeft > 0 || this.tauntLeft > 0
  }

  /** 当前速度：停下时 0，减速时打折。 */
  get speed(): number {
    if (this.held) return 0
    return ENEMIES[this.kind].speed * (1 - this.slowPct)
  }

  get remaining(): number {
    return this.path.length - this.dist
  }

  override process(dt: number) {
    if (this.dead) return
    this._move(this.speed * dt)
    // 弹跳：|sin| 的一拍是一下，落地（接近 0）时压扁；冰冻时停住，减速时跳得慢
    if (!this.held) this._hop += dt * ENEMY_FEEL.hopRate * Math.PI * (1 - this.slowPct)
    const s = Math.abs(Math.sin(this._hop))
    const squash = (1 - s) * ENEMY_FEEL.squash
    const k = ENEMIES[this.kind].scale
    this.body.y = -this._halfHeight - s * ENEMY_FEEL.hopHeight
    this.body.scale = v(k * (1 + squash), k * (1 - squash))
    if (this._flashLeft > 0) {
      this._flashLeft = Math.max(0, this._flashLeft - dt)
      this.body.flash = this._flashLeft / ENEMY_FEEL.flashTime
    }
    if (this.dist >= this.path.length) this.leaked = true
  }

  /** 沿路线往回推 `d` 像素（击退），位置马上更新（撞人判定要用新位置）。 */
  pushBack(d: number): void {
    this._move(-d)
  }

  /** 扣血；返回是否被这一下打死。 */
  damage(amount: number): boolean {
    if (this.dead) return false
    this.hp -= amount
    this._flashLeft = ENEMY_FEEL.flashTime
    this.body.flash = 1
    this.barBack.visible = true
    this.barFill.scale = v(Math.max(0, this.hp / this.maxHp), 1)
    if (this.hp > 0) return false
    this.dead = true
    return true
  }

  private _move(delta: number) {
    this.dist = Math.max(0, this.dist + delta)
    this.path.sample(this.dist, this._p)
    this.x = this._p.x
    this.y = this._p.y
    this.body.flipH = Math.cos(this.path.angleAt(this.dist)) < 0
    this.zIndex = this._p.y // 下面的画在上面
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), kind: this.kind, hp: Math.round(this.hp), dist: Math.round(this.dist) }
  }
}
