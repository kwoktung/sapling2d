import { circle, CollisionShape2D, Ease, RigidBody2D, Sprite2D, v, type Vector2 } from 'sapling2d'
import { ASSETS, DANGER_Y, FRUITS, GRACE, TEXTURE_SCALE } from './config'

/** 一个水果：圆形刚体 + 贴图。同级水果相撞由 GameScene 合成。 */
export class Fruit extends RigidBody2D {
  /** 已经参与合成（即将销毁），不能再和别的水果合成 */
  merging = false
  /** 存在的时间（秒） */
  age = 0
  /** 连续高于警戒线的时间（秒） */
  overLine = 0
  readonly sprite: Sprite2D

  constructor(
    readonly level: number,
    position: Vector2,
  ) {
    const r = FRUITS[level]!.radius
    super({ name: `Fruit${level}`, position, friction: 0.2, bounce: 0.1, mass: (r / 30) ** 2, groups: ['fruits'] })
    this.add(new CollisionShape2D({ shape: circle(r) }))
    this.sprite = this.add(new Sprite2D({ texture: ASSETS.fruits[level]!, scale: v(TEXTURE_SCALE, TEXTURE_SCALE) }))
  }

  get radius(): number {
    return FRUITS[this.level]!.radius
  }

  /** 合成出来时的弹出动画（只缩放贴图，碰撞形状不变）。 */
  pop(): void {
    this.sprite.scale = v(TEXTURE_SCALE * 0.6, TEXTURE_SCALE * 0.6)
    this.createTween().to(this.sprite, { scale: v(TEXTURE_SCALE, TEXTURE_SCALE) }, 0.25, Ease.BackOut)
  }

  override physicsProcess(dt: number): void {
    this.age += dt
    const aboveLine = this.y - this.radius < DANGER_Y
    this.overLine = this.age > GRACE && aboveLine ? this.overLine + dt : 0
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), level: this.level }
  }
}
