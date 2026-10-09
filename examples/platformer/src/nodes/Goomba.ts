import { AnimatedSprite2D, CharacterBody2D, rectangle, type RectangleShape2D, v } from 'sapling2d'
import { ASSETS } from '../assets'
import { GOOMBA } from '../config'

const SHAPE = rectangle(GOOMBA.width, GOOMBA.height)

/** 敌人：CharacterBody2D，左右走，撞墙掉头；进入屏幕附近才开始走。被踩扁后停一会儿再消失。 */
export class Goomba extends CharacterBody2D {
  readonly hitShape: RectangleShape2D = SHAPE
  /** 被踩扁或掉出关卡：HitTester 不再比较它。 */
  dead = false
  /** 进入屏幕附近之前不动。 */
  awake = false
  private readonly _sprite: AnimatedSprite2D<'walk' | 'flat'>
  private _dir = -1

  constructor(x: number, y: number) {
    super({ name: 'Goomba', shape: SHAPE, position: v(x, y) })
    const f = ASSETS.goomba.frames()
    this._sprite = this.add(new AnimatedSprite2D<'walk' | 'flat'>({ animations: { walk: { frames: [f[0]!, f[1]!], fps: 6 }, flat: { frames: [f[2]!] } }, animation: 'walk' }))
  }

  override physicsProcess(dt: number) {
    if (!this.awake || this.dead) return
    this.setVelocity(this._dir * GOOMBA.speed, Math.min(this.velocityY + GOOMBA.gravity * dt, 400))
    this.moveAndSlide()
    if (this.isOnWall) this._dir = -this._dir
  }

  /** 被踩扁：停下、换成扁的图，过一会儿消失。 */
  squash(): void {
    if (this.dead) return
    this.dead = true
    this._sprite.play('flat')
    this.tree.createTimer(GOOMBA.flatTime).timeout.connect(() => this.queueFree(), this)
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), awake: this.awake || undefined, dead: this.dead || undefined }
  }
}
