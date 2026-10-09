import { CharacterBody2D, circle, rectangle, Sprite2D, type Texture, v } from 'sapling2d'
import { FIGHTER, RING, Z } from '../config'
import type { Knife } from './Knife'

const BOX = rectangle(FIGHTER.box, FIGHTER.box)
const BODY = circle(FIGHTER.radius)
const TAU = Math.PI * 2

/**
 * 带刀圈的角色（玩家和敌人）：CharacterBody2D，被墙和石头挡住；身边的刀圈一直在转。
 * 子类在 `think()` 里设置想要的速度 `moveX` / `moveY`；场地每个物理步算好推挤量 `pushX` / `pushY`。
 */
export abstract class Fighter extends CharacterBody2D {
  /** 身体（HitTester：推挤、捡刀）。 */
  readonly hitShape = BODY
  readonly knives: Knife[] = []
  /** 刀圈转到的角度（第 0 把刀的方向）和转速（弧度/秒）。 */
  ringAngle = 0
  spin: number
  ringRadius: number = RING.minRadius
  /** 这一步要被推开的距离（像素），由场地累加，用完清零。 */
  pushX = 0
  pushY = 0
  /** 想要的移动速度（像素/秒）。 */
  protected moveX = 0
  protected moveY = 0

  constructor(name: string, texture: Texture, x: number, y: number, spin: number) {
    super({ name, shape: BOX, position: v(x, y), zIndex: Z.fighter })
    this.spin = spin
    this.add(new Sprite2D({ texture }))
  }

  /** 设置这一步想要的 `moveX` / `moveY`。 */
  protected abstract think(): void

  override physicsProcess(dt: number) {
    this.think()
    // 推挤也走 moveAndSlide：被推的角色同样会被墙挡住，不会挤进墙里
    const k = FIGHTER.pushStiffness / dt
    this.setVelocity(this.moveX + this.pushX * k, this.moveY + this.pushY * k)
    this.pushX = 0
    this.pushY = 0
    this.moveAndSlide()
    this.ringAngle = (this.ringAngle + this.spin * dt) % TAU
    this.placeKnives()
  }

  /** 把刀收进刀圈：刀圈按刀数变大，刀重新均匀分布。 */
  addKnife(knife: Knife): void {
    knife.owner = this
    knife.zIndex = Z.ringKnife
    this.knives.push(knife)
    this.ringRadius = Math.max(RING.minRadius, (this.knives.length * RING.spacing) / TAU)
    this.placeKnives()
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

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), knives: this.knives.length }
  }
}
