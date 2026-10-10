import { Ease, Node2D, Sprite2D, v } from 'sapling2d'
import { ASSETS } from '../assets'
import { Z } from '../config'
import type { Enemy } from './Enemy'

const FIREBALL_SPEED = 620
/** 火球贴图里火焰的半径（像素，贴图按 2 倍存）。 */
const FIRE_R = 44

/** 火球这一发的效果（法师出手时算好）。 */
export interface Blast {
  damage: number
  radius: number
  slowPct: number
  slowTime: number
  freeze: boolean
  burnGround: boolean
}

/**
 * 火球（对象池复用）：飞向出手时目标所在的点（不追踪），到了回调 `onArrive` 爆炸。
 * 黑底的火球贴图，叠加发光，飞行时打转。
 */
export class Fireball extends Sprite2D {
  active = false
  tx = 0
  ty = 0
  blast: Blast = { damage: 0, radius: 0, slowPct: 0, slowTime: 0, freeze: false, burnGround: false }
  onArrive: ((f: Fireball) => void) | null = null

  constructor() {
    super({ texture: ASSETS.fx.get('fx_fireball'), visible: false, zIndex: Z.projectile, scale: v(0.4, 0.4), blendMode: 'add' })
  }

  launch(x: number, y: number, target: Enemy, blast: Blast): void {
    this.x = x
    this.y = y
    this.tx = target.x
    this.ty = target.y - 20
    this.blast = blast
    this.active = true
    this.visible = true
  }

  override process(dt: number) {
    if (!this.active) return
    this.rotation += dt * 12
    const dx = this.tx - this.x
    const dy = this.ty - this.y
    const d = Math.hypot(dx, dy)
    const step = FIREBALL_SPEED * dt
    if (d <= step) {
      this.x = this.tx
      this.y = this.ty
      this.active = false
      this.visible = false
      this.onArrive?.(this)
      return
    }
    this.x += (dx / d) * step
    this.y += (dy / d) * step
  }
}

/** 燃烧地面：压扁的火团慢慢打转，持续一段时间（Battle 每 0.5 秒对里面的敌人造成伤害），结束时淡出删除。 */
export class BurnZone extends Node2D {
  timeLeft: number
  private readonly _fire: Sprite2D

  constructor(
    x: number,
    y: number,
    readonly radius: number,
    time: number,
  ) {
    const s = radius / FIRE_R
    super({ position: v(x, y), scale: v(1, 0.6), zIndex: Z.preview + 1, blendMode: 'add' })
    this._fire = this.add(new Sprite2D({ texture: ASSETS.fx.get('fx_fireball'), scale: v(s, s), alpha: 0.7 }))
    this.timeLeft = time
  }

  override process(dt: number) {
    this.timeLeft -= dt
    // 打转、微微闪动（压扁的是父节点：子节点转起来还是贴在地上的椭圆）
    this._fire.rotation += dt * 2
    this._fire.alpha = 0.55 + 0.15 * Math.sin(this.timeLeft * 18)
    if (this.timeLeft <= 0) {
      this.timeLeft = Infinity
      this.createTween().to(this, { alpha: 0 }, 0.25).call(() => this.queueFree())
    }
  }

  get burning(): boolean {
    return this.timeLeft > 0 && this.timeLeft !== Infinity
  }
}

/** 闪电贴图里电弧的横向范围（像素）：从 x=10 到 108，中心偏右 9。 */
const BOLT_LEN = 98
const BOLT_SHIFT = 9

/**
 * 一段闪电：横向的闪电贴图旋转、拉长到两点之间（叠加发光），很快淡出。`flip` 上下翻转，连续几跳看起来不一样。
 */
export class Bolt extends Node2D {
  constructor(x0: number, y0: number, x1: number, y1: number, flip: boolean) {
    super({ zIndex: Z.fx, blendMode: 'add' })
    const len = Math.hypot(x1 - x0, y1 - y0)
    const k = len / BOLT_LEN
    const angle = Math.atan2(y1 - y0, x1 - x0)
    this.add(
      new Sprite2D({
        texture: ASSETS.fx.get('fx_lightning'),
        position: v((x0 + x1) / 2 - Math.cos(angle) * BOLT_SHIFT * k, (y0 + y1) / 2 - Math.sin(angle) * BOLT_SHIFT * k),
        rotation: angle,
        scale: v(k, flip ? -0.8 : 0.8),
      }),
    )
  }

  override ready() {
    this.createTween().to(this, { alpha: 0 }, 0.18, Ease.QuadIn).call(() => this.queueFree())
  }
}
