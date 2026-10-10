import { ColorRect, Ease, Node2D, Sprite2D, v, type Curve2D, type Texture, type Tween } from 'sapling2d'
import { ART_SCALE, ASSETS } from '../assets'
import { AGGRO, ENEMY_FEEL } from '../config'
import { ELITE, ENEMIES, type EnemyKind } from '../data/enemies'

/** 怪物追打的目标（英雄）：只要位置和死活。 */
export interface EnemyTarget {
  readonly x: number
  readonly y: number
  readonly dead: boolean
}

/** 怪物的贴图：图集的帧，锚点在脚底（美术管线设的 pivot），按 2 倍存（显示时乘 `ART_SCALE`）。 */
export interface EnemyLook {
  texture: Texture
}

/**
 * 怪物：沿自己的 `Curve2D` 匀速前进（`dist` 是走过的距离，`remaining` 越小离城门越近）。
 * 有 `target`（Battle 按仇恨设置的英雄）时离开路线走过去，到了够得着的距离停下（Battle 结算攻击）；
 * 目标没了就走回离开时的那个路线点，再继续往下。位置 = 路线上的点 + 偏移（`ox`, `oy`），离开路线时路线进度不动。
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
  /** 眩晕（期间停下）、嘲讽（期间只打骑士）的剩余时间。 */
  stunLeft = 0
  tauntLeft = 0
  /** Boss 的技能（召唤 / 复活）还有多久放下一次；巫妖已经复活了几只。 */
  abilityIn: number
  revives = 0
  /** 越过底线了（Battle 扣命后移除）。 */
  leaked = false
  /** 正在追打的英雄（Battle 设置）；离开路线的偏移；离下一次攻击还有多久。 */
  target: EnemyTarget | null = null
  ox = 0
  oy = 0
  attackIn = 0
  /** 身体的半径（像素，按显示的宽度算）：近战够得着的距离 = 英雄半径 + 它。 */
  readonly radius: number
  private _lunge: Tween | null = null
  private _flashLeft = 0
  private _hop: number
  private readonly _p = { x: 0, y: 0 }

  /** 显示的缩放（精灵放大）。 */
  private readonly _sizeScale: number

  constructor(
    readonly kind: EnemyKind,
    readonly path: Curve2D,
    readonly maxHp: number,
    look: EnemyLook,
    phase: number,
    /** 精英：体型大一号、身后一圈金光（血量由 Battle 按精英算好传进来）。 */
    readonly elite = false,
  ) {
    super({ alpha: ENEMIES[kind].alpha ?? 1 })
    const k = (this._sizeScale = ENEMIES[kind].scale * (elite ? ELITE.scale : 1))
    this.abilityIn = ENEMIES[kind].summon?.every ?? ENEMIES[kind].revive?.every ?? 0
    this.hp = maxHp
    this._hop = phase
    // 身体显示出来的高度（已乘缩放）：血条放在它上面
    const height = look.texture.height * ART_SCALE * k
    this.radius = look.texture.width * ART_SCALE * k * 0.35
    if (elite) this.add(new Sprite2D({ texture: ASSETS.glow, position: v(0, -height / 2), scale: v((height / 64) * 1.4, (height / 64) * 1.4), selfModulate: 0xffc030, blendMode: 'add', zIndex: -1 }))
    // 锚点在脚底：身体放在原点，弹跳时往上挪
    this.body = this.add(new Sprite2D({ texture: look.texture, scale: v(k * ART_SCALE, k * ART_SCALE) }))
    this.barBack = this.add(
      new ColorRect({ size: v(ENEMY_FEEL.barWidth, ENEMY_FEEL.barHeight), color: 0x301818, position: v(-ENEMY_FEEL.barWidth / 2, -height - 14), visible: false }),
    )
    this.barBack.add(this.barFill)
    this._move(0, true)
  }

  /** 打死给的经验、漏掉扣的命（精英加倍）。 */
  get xp(): number {
    return ENEMIES[this.kind].xp * (this.elite ? ELITE.xp : 1)
  }

  get leak(): number {
    return ENEMIES[this.kind].leak * (this.elite ? ELITE.leak : 1)
  }

  /** 停下了（冰冻、眩晕）：不走、不打。嘲讽不停下，而是强制去打骑士（Battle 设置 `target`）。 */
  get held(): boolean {
    return this.frozenLeft > 0 || this.stunLeft > 0
  }

  /** 当前速度：停下时 0，减速时打折。 */
  get speed(): number {
    if (this.held) return 0
    return ENEMIES[this.kind].speed * (1 - this.slowPct)
  }

  get remaining(): number {
    return this.path.length - this.dist
  }

  /** 近战够得着的距离。 */
  get reach(): number {
    return AGGRO.heroRadius + this.radius
  }

  /** 目标在够得着的距离内（Battle 这时结算攻击）。 */
  get inReach(): boolean {
    const t = this.target
    return !!t && !t.dead && (t.x - this.x) ** 2 + (t.y - this.y) ** 2 <= (this.reach + 1) ** 2
  }

  override process(dt: number) {
    if (this.dead) return
    const step = this.speed * dt
    const t = this.target
    if (t && !t.dead) this._chase(t, step)
    else if (this.ox !== 0 || this.oy !== 0) this._return(step)
    else this._move(step)
    // 弹跳：|sin| 的一拍是一下，落地（接近 0）时压扁；冰冻时停住，减速时跳得慢
    if (!this.held) this._hop += dt * ENEMY_FEEL.hopRate * Math.PI * (1 - this.slowPct)
    const s = Math.abs(Math.sin(this._hop))
    const squash = (1 - s) * ENEMY_FEEL.squash
    const k = this._sizeScale * ART_SCALE
    this.body.y = -s * ENEMY_FEEL.hopHeight
    this.body.scale = v(k * (1 + squash), k * (1 - squash)) // 朝向用 flipH，不用负的缩放
    if (this._flashLeft > 0) {
      this._flashLeft = Math.max(0, this._flashLeft - dt)
      this.body.flash = this._flashLeft / ENEMY_FEEL.flashTime
    }
    if (this.dist >= this.path.length) this.leaked = true
  }

  /** 攻击时朝目标扑一下（身体往前探再收回）。 */
  lunge(): void {
    const t = this.target
    if (!t) return
    const dx = Math.sign(t.x - this.x) || 1
    this._lunge?.kill()
    this.body.x = 0
    this._lunge = this.createTween()
      .to(this.body, { x: dx * AGGRO.lunge }, AGGRO.lungeTime * 0.4, Ease.QuadOut)
      .to(this.body, { x: 0 }, AGGRO.lungeTime * 0.6, Ease.QuadIn)
  }

  /** 朝目标走，到够得着的距离停下（只改偏移，路线进度不动）。 */
  private _chase(t: EnemyTarget, step: number) {
    const dx = t.x - this.x
    const dy = t.y - this.y
    const d = Math.hypot(dx, dy)
    const go = Math.min(step, d - this.reach)
    if (go > 0) {
      this.ox += (dx / d) * go
      this.oy += (dy / d) * go
    }
    this.body.flipH = dx < 0
    this._move(0)
  }

  /** 走回离开路线时的那个点（偏移缩回 0）。 */
  private _return(step: number) {
    const d = Math.hypot(this.ox, this.oy)
    if (d <= step) {
      this.ox = 0
      this.oy = 0
    } else {
      this.ox -= (this.ox / d) * step
      this.oy -= (this.oy / d) * step
    }
    this.body.flipH = this.ox > 0
    this._move(0, false)
  }

  /** 沿路线往回推 `d` 像素（击退），位置马上更新（撞人判定要用新位置）。 */
  pushBack(d: number): void {
    this._move(-d)
  }

  /** 回血（萨满），不超过上限。 */
  heal(amount: number): void {
    if (this.dead || this.hp >= this.maxHp) return
    this.hp = Math.min(this.maxHp, this.hp + amount)
    this.barFill.scale = v(this.hp / this.maxHp, 1)
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

  /** 路线进度前进 `delta`，位置 = 路线上的点 + 偏移。`face`：按路线方向翻转（追人、回路线时按走的方向，调用方自己翻）。 */
  private _move(delta: number, face = delta !== 0) {
    this.dist = Math.max(0, this.dist + delta)
    this.path.sample(this.dist, this._p)
    this.x = this._p.x + this.ox
    this.y = this._p.y + this.oy
    if (face) this.body.flipH = Math.cos(this.path.angleAt(this.dist)) < 0
    this.zIndex = this.y // 下面的画在上面
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), kind: this.kind, elite: this.elite || undefined, hp: Math.round(this.hp), dist: Math.round(this.dist) }
  }
}
