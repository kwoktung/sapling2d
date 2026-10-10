import { Ease, Node2D, Sprite2D, v } from 'sapling2d'
import { ASSETS } from '../assets'
import { Z } from '../config'
import type { Enemy } from './Enemy'

const FIREBALL_SPEED = 620

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
 * 用光晕贴图染橙色、叠加发光。
 */
export class Fireball extends Sprite2D {
  active = false
  tx = 0
  ty = 0
  blast: Blast = { damage: 0, radius: 0, slowPct: 0, slowTime: 0, freeze: false, burnGround: false }
  onArrive: ((f: Fireball) => void) | null = null

  constructor() {
    super({ texture: ASSETS.glow, visible: false, zIndex: Z.projectile, selfModulate: 0xff8a30, scale: v(0.55, 0.55), blendMode: 'add' })
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

/** 燃烧地面：一块橙色的光晕，持续一段时间（Battle 每 0.5 秒对里面的敌人造成伤害），结束时淡出删除。 */
export class BurnZone extends Sprite2D {
  timeLeft: number

  constructor(
    x: number,
    y: number,
    readonly radius: number,
    time: number,
  ) {
    const s = (radius * 2) / 64
    super({ texture: ASSETS.glow, position: v(x, y), scale: v(s, s * 0.6), selfModulate: 0xff5a10, alpha: 0.7, zIndex: Z.preview + 1, blendMode: 'add' })
    this.timeLeft = time
  }

  override process(dt: number) {
    this.timeLeft -= dt
    // 微微闪动
    this.alpha = 0.55 + 0.15 * Math.sin(this.timeLeft * 18)
    if (this.timeLeft <= 0) {
      this.timeLeft = Infinity
      this.createTween().to(this, { alpha: 0 }, 0.25).call(() => this.queueFree())
    }
  }

  get burning(): boolean {
    return this.timeLeft > 0 && this.timeLeft !== Infinity
  }
}

/**
 * 一段闪电：两点之间拉长的光晕贴图（叠加发光、淡蓝色），很快淡出。
 * 引擎没有画线的节点：用旋转 + 拉伸的精灵拼，中间加一个折点显得不那么直。
 */
export class Bolt extends Node2D {
  constructor(x0: number, y0: number, x1: number, y1: number, jitter: number) {
    super({ zIndex: Z.fx, blendMode: 'add' })
    const mx = (x0 + x1) / 2 + jitter
    const my = (y0 + y1) / 2
    this._segment(x0, y0, mx, my)
    this._segment(mx, my, x1, y1)
  }

  override ready() {
    this.createTween().to(this, { alpha: 0 }, 0.18, Ease.QuadIn).call(() => this.queueFree())
  }

  private _segment(x0: number, y0: number, x1: number, y1: number) {
    const len = Math.hypot(x1 - x0, y1 - y0)
    this.add(
      new Sprite2D({
        texture: ASSETS.glow,
        position: v((x0 + x1) / 2, (y0 + y1) / 2),
        rotation: Math.atan2(y1 - y0, x1 - x0),
        scale: v(len / 50, 0.22),
        selfModulate: 0x9fd8ff,
      }),
    )
  }
}
