import { Sprite2D, v } from 'sapling2d'
import { ASSETS } from '../assets'
import { Z } from '../config'
import type { Enemy } from './Enemy'

const SPEED = 1100
const NORMAL_SCALE = v(1, 1)
/** 爆头的箭画大一点。 */
const HEADSHOT_SCALE = v(1.6, 1.6)
/** 穿透箭碰到敌人的距离（像素）。 */
export const PIERCE_RADIUS = 30

/** 一支箭这一发的效果（出手时由弓手按技能算好）。 */
export interface Shot {
  damage: number
  crit: boolean
  /** 爆头：无视护甲。 */
  headshot: boolean
  /** 命中时加一层毒；null 表示没有毒箭。 */
  poison: { dps: number; time: number; maxStacks: number } | null
  /** 穿透：不追踪，沿出手方向直线飞，打中沿途所有敌人。 */
  pierce: boolean
}

/**
 * 箭（对象池复用：用完 `active = false` 并隐藏，不 queueFree）。
 * 普通箭追踪目标，目标没了就飞到它最后的位置，到达时回调 `onArrive`；
 * 穿透箭沿出手方向直线飞 `range` 的 1.5 倍，每帧回调 `onPierce` 检查碰到的敌人（`hit` 记下打过的，每只只打一次）。
 */
export class Arrow extends Sprite2D {
  active = false
  target: Enemy | null = null
  tx = 0
  ty = 0
  shot: Shot = { damage: 0, crit: false, headshot: false, poison: null, pierce: false }
  readonly hit = new Set<Enemy>()
  onArrive: ((a: Arrow) => void) | null = null
  onPierce: ((a: Arrow) => void) | null = null
  private _dirX = 0
  private _dirY = 0
  private _left = 0

  constructor() {
    super({ texture: ASSETS.arrow, visible: false, zIndex: Z.projectile })
  }

  launch(x: number, y: number, target: Enemy, shot: Shot, range: number): void {
    this.x = x
    this.y = y
    this.target = target
    this.tx = target.x
    this.ty = target.y - 24
    this.shot = shot
    this.hit.clear()
    this.active = true
    this.visible = true
    const dx = this.tx - x
    const dy = this.ty - y
    const d = Math.hypot(dx, dy) || 1
    this._dirX = dx / d
    this._dirY = dy / d
    this._left = range * 1.5
    this.rotation = Math.atan2(dx, -dy)
    this.scale = shot.headshot ? HEADSHOT_SCALE : NORMAL_SCALE
  }

  override process(dt: number) {
    if (!this.active) return
    const step = SPEED * dt
    if (this.shot.pierce) {
      this.x += this._dirX * step
      this.y += this._dirY * step
      this._left -= step
      this.onPierce?.(this)
      if (this._left <= 0) this._stop()
      return
    }
    const t = this.target
    if (t && !t.dead && !t.leaked) {
      this.tx = t.x
      this.ty = t.y - 24 // 打在身体上，不是脚底
    }
    const dx = this.tx - this.x
    const dy = this.ty - this.y
    const d = Math.hypot(dx, dy)
    this.rotation = Math.atan2(dx, -dy) // 贴图朝上
    if (d <= step) {
      this.x = this.tx
      this.y = this.ty
      this._stop()
      this.onArrive?.(this)
      return
    }
    this.x += (dx / d) * step
    this.y += (dy / d) * step
  }

  private _stop() {
    this.active = false
    this.visible = false
  }
}
