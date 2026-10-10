import { Sprite2D, v } from 'sapling2d'
import { ASSETS } from '../assets'
import { Z } from '../config'
import type { Enemy } from './Enemy'

export type ProjectileKind = 'arrow' | 'fireball'

const SPEED: Record<ProjectileKind, number> = { arrow: 1100, fireball: 600 }
const ONE = v(1, 1)
const FIREBALL_SCALE = v(0.5, 0.5)

/**
 * 箭和火球（对象池复用：用完 `active = false` 并隐藏，不 queueFree）。
 * 箭追踪目标，目标没了就飞向它最后的位置；火球飞向发射时目标所在的点（落地爆炸）。
 * 到达时回调 `onArrive`。
 *
 * 引擎缺口（验证清单“对象池”“Trail”）：池子在 Battle 里手写；箭没有拖尾。
 */
export class Projectile extends Sprite2D {
  kind: ProjectileKind = 'arrow'
  active = false
  target: Enemy | null = null
  tx = 0
  ty = 0
  damage = 0
  onArrive: ((p: Projectile) => void) | null = null

  constructor() {
    super({ texture: ASSETS.arrow, visible: false })
  }

  launch(kind: ProjectileKind, x: number, y: number, target: Enemy, damage: number): void {
    this.kind = kind
    this.texture = kind === 'arrow' ? ASSETS.arrow : ASSETS.glow
    this.selfModulate = kind === 'arrow' ? 0xffffff : 0xff8a30
    this.scale = kind === 'arrow' ? ONE : FIREBALL_SCALE
    // 火球叠加发光，画在箭上面一层：同类挨在一起绘制，箭和火球交替出现时不会每个都打断合批
    this.blendMode = kind === 'arrow' ? 'inherit' : 'add'
    this.zIndex = kind === 'arrow' ? Z.projectile : Z.projectile + 1
    this.x = x
    this.y = y
    this.target = kind === 'arrow' ? target : null
    this.tx = target.x
    this.ty = target.y
    this.damage = damage
    this.active = true
    this.visible = true
  }

  override process(dt: number) {
    if (!this.active) return
    const t = this.target
    if (t && !t.dead && !t.leaked) {
      this.tx = t.x
      this.ty = t.y
    }
    const dx = this.tx - this.x
    const dy = this.ty - this.y
    const d = Math.hypot(dx, dy)
    const step = SPEED[this.kind] * dt
    if (this.kind === 'arrow') this.rotation = Math.atan2(dx, -dy) // 贴图朝上
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
