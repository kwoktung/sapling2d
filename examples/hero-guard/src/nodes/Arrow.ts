import { Sprite2D } from 'sapling2d'
import { ASSETS } from '../assets'
import { Z } from '../config'
import type { Enemy } from './Enemy'

const SPEED = 1100

/**
 * 箭（对象池复用：用完 `active = false` 并隐藏，不 queueFree）。追踪目标；目标没了就飞到它最后的位置。
 * 到达时回调 `onArrive`。
 */
export class Arrow extends Sprite2D {
  active = false
  target: Enemy | null = null
  tx = 0
  ty = 0
  damage = 0
  onArrive: ((a: Arrow) => void) | null = null

  constructor() {
    super({ texture: ASSETS.arrow, visible: false, zIndex: Z.projectile })
  }

  launch(x: number, y: number, target: Enemy, damage: number): void {
    this.x = x
    this.y = y
    this.target = target
    this.tx = target.x
    this.ty = target.y - 24
    this.damage = damage
    this.active = true
    this.visible = true
  }

  override process(dt: number) {
    if (!this.active) return
    const t = this.target
    if (t && !t.dead && !t.leaked) {
      this.tx = t.x
      this.ty = t.y - 24 // 打在身体上，不是脚底
    }
    const dx = this.tx - this.x
    const dy = this.ty - this.y
    const d = Math.hypot(dx, dy)
    const step = SPEED * dt
    this.rotation = Math.atan2(dx, -dy) // 贴图朝上
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
