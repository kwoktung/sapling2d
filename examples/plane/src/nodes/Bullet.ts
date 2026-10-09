import { Sprite2D, type CircleShape2D, type Sprite2DOptions } from 'sapling2d'
import { bounds } from './bounds'

export interface BulletOptions extends Sprite2DOptions {
  vx: number
  vy: number
  hitShape: CircleShape2D
}

/** 子弹（玩家和敌人共用）：直线飞行，飞出可见区域后销毁。 */
export class Bullet extends Sprite2D {
  vx: number
  vy: number
  readonly hitShape: CircleShape2D
  dead = false

  constructor(options: BulletOptions) {
    super(options)
    this.vx = options.vx
    this.vy = options.vy
    this.hitShape = options.hitShape
  }

  override process(dt: number) {
    const x = (this.x += this.vx * dt)
    const y = (this.y += this.vy * dt)
    if (y < bounds.top - 40 || y > bounds.bottom + 40 || x < bounds.left - 40 || x > bounds.right + 40) this.kill()
  }

  kill() {
    if (this.dead) return
    this.dead = true
    this.queueFree()
  }
}
