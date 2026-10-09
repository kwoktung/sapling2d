import { CharacterBody2D, circle, type CircleShape2D, ColorRect, rectangle, Sprite2D, type Texture, type Tween, v } from 'sapling2d'
import { FIGHTER, RING, Z } from '../config'
import type { RingBody } from '../KnifeCollider'
import type { Knife } from './Knife'

const BOX = rectangle(FIGHTER.box, FIGHTER.box)
const BODY = circle(FIGHTER.radius)
const TAU = Math.PI * 2
/** 刀圈角度不取模（KnifeCollider 要用这一步转过的角度），转得太多时整圈整圈地减回来，保持精度。 */
const ANGLE_LIMIT = TAU * 1000

/** 角色的外形和血量。 */
export interface FighterOptions {
  name: string
  texture: Texture
  x: number
  y: number
  /** 刀圈转速（弧度/秒，负数反向转）。 */
  spin: number
  hp: number
  /** 身体半径和碰墙方框边长；默认是普通角色的大小。贴图按半径缩放（贴图本身按半径画好时不缩放）。 */
  radius?: number
  box?: number
  /** 头顶显示血条（敌人）。 */
  healthBar?: boolean
}

/**
 * 带刀圈的角色（玩家和敌人）：CharacterBody2D，被墙和石头挡住；身边的刀圈一直在转。
 * 场地每个物理步按顺序驱动所有角色（`step`），再统一判定刀的碰撞，所以不覆写 `physicsProcess`。
 * 子类在 `think()` 里设置想要的速度 `moveX` / `moveY`；场地每个物理步算好推挤量 `pushX` / `pushY`。
 */
export abstract class Fighter extends CharacterBody2D implements RingBody {
  /** 身体（HitTester：推挤、捡刀）。 */
  readonly hitShape: CircleShape2D
  readonly knives: Knife[] = []
  hp: number
  readonly maxHp: number
  /** 血量为 0，等待场地处理（打散刀圈、删除）。 */
  dead = false
  /** 身体的贴图（受伤时只让它变红，不影响血条）。 */
  readonly sprite: Sprite2D
  private readonly _bar: ColorRect | null = null
  /** 刀圈转到的角度（第 0 把刀的方向，不取模）和转速（弧度/秒）。 */
  ringAngle = 0
  spin: number
  ringRadius: number = RING.minRadius
  /** 这一步开始时的位置和刀圈角度（KnifeCollider 按这一步的运动拆子步）。 */
  prevX: number
  prevY: number
  prevAngle = 0
  /** 这一步要被推开的距离（像素），由场地累加，用完清零。 */
  pushX = 0
  pushY = 0
  /** 想要的移动速度（像素/秒）。 */
  protected moveX = 0
  protected moveY = 0
  private _flash: Tween | null = null

  constructor(o: FighterOptions) {
    const radius = o.radius ?? FIGHTER.radius
    super({ name: o.name, shape: o.box ? rectangle(o.box, o.box) : BOX, position: v(o.x, o.y), zIndex: Z.fighter })
    this.hitShape = radius === FIGHTER.radius ? BODY : circle(radius)
    this.spin = o.spin
    this.hp = o.hp
    this.maxHp = o.hp
    this.prevX = o.x
    this.prevY = o.y
    this.sprite = this.add(new Sprite2D({ texture: o.texture }))
    if (o.healthBar) {
      // 血条：底色 + 填充（ColorRect 原点在左上角，改 scale.x 时左端不动）
      const w = FIGHTER.barWidth
      const back = this.add(new ColorRect({ name: 'HpBar', position: v(-w / 2, -radius - FIGHTER.barGap - FIGHTER.barHeight), size: v(w, FIGHTER.barHeight), color: 0x301818 }))
      this._bar = back.add(new ColorRect({ size: v(w, FIGHTER.barHeight), color: 0xe04848 }))
    }
  }

  get knifeCount(): number {
    return this.knives.length
  }

  get bodyRadius(): number {
    return this.hitShape.radius
  }

  /** 设置这一步想要的 `moveX` / `moveY`。 */
  protected abstract think(): void

  /** 一个物理步：移动（被墙挡住）、转刀圈、摆放刀。由场地在 `physicsProcess` 里调用。 */
  step(dt: number): void {
    this.prevX = this.x
    this.prevY = this.y
    this.think()
    // 推挤也走 moveAndSlide：被推的角色同样会被墙挡住，不会挤进墙里
    const k = FIGHTER.pushStiffness / dt
    this.setVelocity(this.moveX + this.pushX * k, this.moveY + this.pushY * k)
    this.pushX = 0
    this.pushY = 0
    this.moveAndSlide()
    if (Math.abs(this.ringAngle) > ANGLE_LIMIT) this.ringAngle %= TAU
    this.prevAngle = this.ringAngle
    this.ringAngle += this.spin * dt
    this.placeKnives()
  }

  /** 把刀收进刀圈：刀圈按刀数变大，刀重新均匀分布。 */
  addKnife(knife: Knife): void {
    knife.owner = this
    knife.zIndex = Z.ringKnife
    this.knives.push(knife)
    this._resize()
  }

  /** 从刀圈里拿掉一把刀（打飞时）。 */
  removeKnife(knife: Knife): void {
    const i = this.knives.indexOf(knife)
    if (i < 0) return
    this.knives.splice(i, 1)
    knife.owner = null
    this._resize()
  }

  /** 受伤：扣血、身体闪一下红。血量为 0 时 `dead` 变成 true（场地负责后续）。 */
  damage(amount: number): void {
    if (this.dead) return
    this.hp = Math.max(0, this.hp - amount)
    if (this._bar) this._bar.scale = v(Math.min(1, this.hp / this.maxHp), 1)
    this._flash?.kill()
    this.sprite.modulate = 0xff5050
    this._flash = this.sprite.createTween().to(this.sprite, { modulate: 0xffffff }, FIGHTER.flashTime)
    if (this.hp === 0) this.dead = true
  }

  /** 按刀圈角度摆放每把刀（场地坐标，刀尖朝外）。不分配内存。 */
  placeKnives(): void {
    const knives = this.knives
    const n = knives.length
    if (n === 0) return
    const step = TAU / n
    const r = this.ringRadius
    const cx = this.x
    const cy = this.y
    for (let i = 0; i < n; i++) {
      const a = this.ringAngle + i * step
      const k = knives[i]!
      k.x = cx + Math.cos(a) * r
      k.y = cy + Math.sin(a) * r
      k.rotation = a + Math.PI / 2 // 贴图的刀尖朝上（-y），转到朝外
    }
  }

  private _resize() {
    this.ringRadius = Math.max(RING.minRadius, (this.knives.length * RING.spacing) / TAU)
    this.placeKnives()
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), knives: this.knives.length, hp: this.hp, dead: this.dead || undefined }
  }
}
