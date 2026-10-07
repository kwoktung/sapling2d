import { circle, CollisionShape2D, Label, pointerPress, rectangle, RigidBody2D, Scene, sfx, Sprite2D, StaticBody2D, tex, v, type Vector2 } from 'sapling2d'

declare module 'sapling2d' {
  interface ActionRegistry {
    drop: true
  }
  interface GroupRegistry {
    balls: Ball
  }
}

const ASSETS = { ball: tex('ball.png'), pop: sfx('pop.mp3') }

/** 一个球：刚体 + 碰撞圆 + 贴图（ball.png 是 128×128，按半径缩放） */
export class Ball extends RigidBody2D {
  constructor(position: Vector2, radius = 40) {
    super({ position, bounce: 0.4, groups: ['balls'] })
    this.add(new CollisionShape2D({ shape: circle(radius) }))
    const s = (radius * 2) / 128
    this.add(new Sprite2D({ texture: ASSETS.ball, scale: v(s, s) }))
  }
}

/** 入口场景：点击屏幕在点击位置放下一个球 */
export class MainScene extends Scene {
  static override assets = ASSETS
  count = 0
  #label!: Label

  override ready() {
    const floor = this.add(new StaticBody2D({ name: 'Floor', position: v(375, 1250) }))
    floor.add(new CollisionShape2D({ shape: rectangle(750, 100) }))
    this.#label = this.add(new Label({ text: '点击屏幕放下小球', fontSize: 40, align: 'center', position: v(375, this.tree.viewport.safeRect.top + 40) }))
  }

  override process() {
    const input = this.tree.input
    if (input.isActionJustPressed('drop') && input.pointerPosition) this.spawn(input.pointerPosition)
  }

  spawn(at: Vector2): Ball {
    this.count++
    this.#label.text = `${this.count} 个小球`
    this.tree.audio.play(ASSETS.pop)
    return this.add(new Ball(at))
  }
}

/** 浏览器和小游戏共用的启动参数 */
export const gameOptions = {
  main: MainScene,
  background: 0x1e2a38,
  actions: { drop: [pointerPress()] },
}
