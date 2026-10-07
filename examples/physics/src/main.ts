import { Area2D, AudioStreamPlayer, circle, CollisionShape2D, key, Label, pointerPress, polygon, rectangle, RigidBody2D, Scene, Sprite2D, StaticBody2D, music, sfx, tex, v, type Vector2 } from 'sapling2d'
import { startGame } from 'sapling2d/browser'

declare module 'sapling2d' {
  interface ActionRegistry {
    drop: true
    clear: true
    mute: true
  }
}

const FRUIT = tex('fruit.png') // 128×128

/** 一个圆形水果：刚体 + 碰撞圆 + 按半径缩放的贴图。 */
class Fruit extends RigidBody2D {
  constructor(position: Vector2, radius: number) {
    super({ position, friction: 0.4, bounce: 0.15, groups: ['fruits'] })
    this.add(new CollisionShape2D({ shape: circle(radius) }))
    const s = (radius * 2) / 128
    this.add(new Sprite2D({ texture: FRUIT, scale: v(s, s) }))
  }
}

/** 三角形刚体：凸多边形碰撞形状（没有贴图，用三个小球标出顶点）。 */
class Triangle extends RigidBody2D {
  constructor(position: Vector2, size: number) {
    super({ position, friction: 0.6, groups: ['fruits'] })
    const pts = [v(-size, size * 0.8), v(size, size * 0.8), v(0, -size)]
    this.add(new CollisionShape2D({ shape: polygon(pts) }))
    for (const p of pts) this.add(new Sprite2D({ texture: FRUIT, position: p, scale: v(0.15, 0.15) }))
  }
}

/** 一个静态矩形（地面、墙壁）。 */
function wall(position: Vector2, width: number, height: number) {
  const body = new StaticBody2D({ position })
  body.add(new CollisionShape2D({ shape: rectangle(width, height) }))
  return body
}

class Main extends Scene {
  static override assets = { fruit: FRUIT, pop: sfx('pop.mp3'), bgm: music('bgm.mp3') }
  #info!: Label
  #deadline!: Area2D
  #drops = 0

  override ready() {
    // 容器：750 宽的竖直箱子，底部在 y=1250
    this.add(wall(v(375, 1300), 750, 100))
    this.add(wall(v(-50, 667), 100, 1600))
    this.add(wall(v(800, 667), 100, 1600))
    this.add(new AudioStreamPlayer({ name: 'Bgm', stream: Main.assets.bgm, loop: true, volume: 0.5, autoplay: true }))
    this.add(new Label({ text: '点击投放水果 · C 清空 · M 静音音乐', fontSize: 36, align: 'center', position: v(375, this.tree.viewport.safeRect.top + 40) }))
    // 警戒线：一个细长的检测区域，统计越过它的物体
    this.#deadline = this.add(new Area2D({ name: 'Deadline', position: v(375, 450) }))
    this.#deadline.add(new CollisionShape2D({ shape: rectangle(750, 8) }))
    this.add(new Label({ text: '— 警戒线 —', fontSize: 24, color: 0xff6b6b, align: 'center', verticalAlign: 'bottom', position: v(375, 440) }))
    this.#info = this.add(new Label({ fontSize: 28, color: 0xaee6ff, align: 'center', position: v(375, this.tree.viewport.safeRect.top + 100) }))
  }

  override process() {
    const input = this.tree.input
    if (input.isActionJustPressed('drop') && input.pointerPosition) {
      const x = Math.min(Math.max(input.pointerPosition.x, 60), 690)
      const size = this.tree.rng.randfRange(25, 60)
      this.add(++this.#drops % 3 === 0 ? new Triangle(v(x, 200), size) : new Fruit(v(x, 200), size))
      this.tree.audio.play(Main.assets.pop, { volume: 0.6 })
    }
    if (input.isActionJustPressed('mute')) {
      this.tree.audio.setBusMute('Music', !this.tree.audio.isBusMuted('Music'))
    }
    if (input.isActionJustPressed('clear')) {
      for (const f of this.tree.getNodesInGroup('fruits')) f.queueFree()
    }
    const fruits = this.tree.getNodesInGroup('fruits')
    const awake = fruits.filter((f) => f instanceof RigidBody2D && !f.sleeping).length
    this.#info.text = `物体 ${fruits.length} 个 · 活动 ${awake} 个 · 压线 ${this.#deadline.getOverlappingBodies().length} 个`
  }
}

const game = await startGame({
  main: Main,
  background: 0x1e2a38,
  actions: { drop: [pointerPress()], clear: [key('KeyC')], mute: [key('KeyM')] },
})
Object.assign(globalThis, { sapling: game })
