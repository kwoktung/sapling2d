import { AnimatedSprite2D, CharacterBody2D, rectangle, type RectangleShape2D, type TileMapLayer, v } from 'sapling2d'
import { ASSETS } from '../assets'
import { PLAYER } from '../config'

type Anim = 'idle' | 'run' | 'jump' | 'dead'
export type MarioState = 'play' | 'dead' | 'clear'

const SHAPE = rectangle(PLAYER.width, PLAYER.height)

/**
 * 马里奥：CharacterBody2D，在 physicsProcess 里按输入算速度、moveAndSlide。
 * 顶到格子时通知关卡（`onBump`）；死亡后不再碰撞，弹起再掉出屏幕。
 */
export class Mario extends CharacterBody2D {
  readonly hitShape: RectangleShape2D = SHAPE
  state: MarioState = 'play'
  /** 关卡每帧设置：画面左边界（世界坐标），马里奥不能走回去。 */
  leftLimit = 0
  /** 这一个物理步开始前的脚底 y 和竖直速度：判断“踩”用。 */
  prevBottom = 0
  prevVelocityY = 0
  /** 顶到格子（只算向上撞到的）。 */
  onBump: (layer: TileMapLayer, cellX: number, cellY: number) => void = () => {}
  private readonly _sprite: AnimatedSprite2D<Anim>
  private _anim: Anim = 'idle'

  constructor(x: number, y: number) {
    super({ name: 'Mario', shape: SHAPE, position: v(x, y) })
    const f = ASSETS.mario.frames()
    this._sprite = this.add(
      new AnimatedSprite2D<Anim>({
        animations: {
          idle: { frames: [f[0]!] },
          run: { frames: [f[1]!, f[2]!], fps: 10 },
          jump: { frames: [f[3]!] },
          dead: { frames: [f[4]!] },
        },
        animation: 'idle',
      }),
    )
  }

  get isDead(): boolean {
    return this.state === 'dead'
  }

  override physicsProcess(dt: number) {
    this.prevBottom = this.y + PLAYER.height / 2
    this.prevVelocityY = this.velocityY
    if (this.state === 'dead') {
      // 死亡：不再碰撞，按重力掉下去
      this.velocityY = Math.min(this.velocityY + PLAYER.gravity * dt, PLAYER.maxFallSpeed)
      this.y += this.velocityY * dt
      return
    }
    const input = this.tree.input
    const dir = this.state === 'clear' ? 0 : (input.isActionPressed('right') ? 1 : 0) - (input.isActionPressed('left') ? 1 : 0)
    let vx = this.velocityX
    if (dir !== 0) {
      vx += dir * PLAYER.accel * dt
      if (vx > PLAYER.maxSpeed) vx = PLAYER.maxSpeed
      if (vx < -PLAYER.maxSpeed) vx = -PLAYER.maxSpeed
    } else {
      const slow = PLAYER.friction * dt
      vx = vx > slow ? vx - slow : vx < -slow ? vx + slow : 0
    }
    let vy = this.velocityY
    // 跳：按住跳跃键时上升阶段的重力小，跳得更高
    if (this.isOnFloor && this.state === 'play' && input.isActionJustPressed('jump')) vy = -PLAYER.jumpSpeed
    const holding = vy < 0 && this.state === 'play' && input.isActionPressed('jump')
    vy = Math.min(vy + (holding ? PLAYER.gravityHold : PLAYER.gravity) * dt, PLAYER.maxFallSpeed)
    this.setVelocity(vx, vy)
    this.moveAndSlide()
    // 不能走出画面左边
    const left = this.leftLimit + PLAYER.width / 2
    if (this.x < left) {
      this.x = left
      if (this.velocityX < 0) this.velocityX = 0
    }
    for (let i = 0; i < this.slideCollisionCount; i++) {
      const c = this.getSlideCollision(i)
      if (c.normal.y > 0) this.onBump(c.tileMap, c.cellX, c.cellY)
    }
  }

  override process() {
    // 只在动画需要变化时切换（play 同一个单帧动画会重设帧）
    const anim: Anim = this.state === 'dead' ? 'dead' : !this.isOnFloor ? 'jump' : Math.abs(this.velocityX) > 5 ? 'run' : 'idle'
    if (anim !== this._anim) {
      this._anim = anim
      this._sprite.play(anim)
    }
    if (this.velocityX < -1) this._sprite.flipH = true
    else if (this.velocityX > 1) this._sprite.flipH = false
  }

  /** 踩到敌人后弹起。 */
  bounce(): void {
    this.velocityY = -PLAYER.bounceSpeed
  }

  /** 死亡：弹起（掉坑时不弹），之后按重力掉出屏幕。 */
  die(fell: boolean): void {
    if (this.state === 'dead') return
    this.state = 'dead'
    this.velocityX = 0
    this.velocityY = fell ? 0 : -PLAYER.jumpSpeed
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), state: this.state }
  }
}
