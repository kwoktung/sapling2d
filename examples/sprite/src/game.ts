// 游戏本体：与平台无关。浏览器入口是 main.ts，微信小游戏入口是 main.wechat.ts
import { AnimatedSprite2D, atlas, key, Label, Node2D, pointerPress, Scene, sheet, Sprite2D, tex, v, type Vector2 } from 'sapling2d'
import spritesData from './sprites.json'

declare module 'sapling2d' {
  interface ActionRegistry {
    spawn: true
    reverse: true
  }
}

/** 绕自身旋转，带着一个子精灵公转。点击它（或按空格）反向，并闪一下红色（modulate 连同子精灵一起染色）。 */
class Spinner extends Sprite2D {
  speed = 1.5 // 弧度/秒

  override ready() {
    this.inputPickable = true
    this.clicked.connect(() => this.reverse(), this)
    this.add(new Sprite2D({ name: 'Moon', texture: Main.assets.fruit, position: v(160, 0), scale: v(0.4, 0.4) }))
  }

  reverse() {
    this.speed = -this.speed
    this.modulate = 0xff4040
    this.createTween().to(this, { modulate: 0xffffff }, 0.4) // 颜色按 RGB 通道渐变
  }

  override process(dt: number) {
    if (this.tree.input.isActionJustPressed('reverse')) this.reverse()
    this.rotation += this.speed * dt
  }
}

/** 可以拖动的精灵。拖动时变蓝、半透明（selfModulate 只染自己）。 */
class Draggable extends Sprite2D {
  #grab: Vector2 | null = null

  override ready() {
    this.inputPickable = true
    this.pointerDown.connect((e) => {
      this.#grab = this.position.sub(this.parentLocal(e.position))
      this.selfModulate = 0x80c0ff
      this.alpha = 0.6
    }, this)
    this.pointerMove.connect((e) => this.#grab && (this.position = this.parentLocal(e.position).add(this.#grab)), this)
    this.pointerUp.connect(() => {
      this.#grab = null
      this.selfModulate = 0xffffff
      this.alpha = 1
    }, this)
  }

  /** 全局坐标 → 父节点的局部坐标。 */
  parentLocal(p: Vector2): Vector2 {
    return this.parent instanceof Node2D ? this.parent.toLocal(p) : p
  }
}

/** 四个小球贴在可见区域的四个角上，屏幕尺寸变化时重新贴边。 */
class CornerMarkers extends Node2D {
  override ready() {
    for (let i = 0; i < 4; i++) this.add(new Sprite2D({ texture: Main.assets.fruit, scale: v(0.3, 0.3) }))
    this.layout()
    this.tree.viewport.resized.connect(() => this.layout(), this)
  }

  layout() {
    const r = this.tree.viewport.visibleRect
    const pad = 24
    const corners = [v(r.left + pad, r.top + pad), v(r.right - pad, r.top + pad), v(r.left + pad, r.bottom - pad), v(r.right - pad, r.bottom - pad)]
    this.children.forEach((c, i) => ((c as Sprite2D).position = corners[i]!))
  }
}

/** 每秒加一的计数器（Timer 在工单 10 中实现，这里先用 process 累加时间）。 */
class Counter extends Label {
  count = 0
  #elapsed = 0

  override process(dt: number) {
    this.#elapsed += dt
    if (this.#elapsed >= 1) {
      this.#elapsed -= 1
      this.count++
      this.text = `${this.count} 秒`
    }
  }
}

export class Main extends Scene {
  static override assets = {
    fruit: tex('fruit.png'),
    boom: sheet('explosion.png', { columns: 4, rows: 2 }), // 网格图集：8 帧爆炸
    sprites: atlas('sprites.png', spritesData), // 打包图集：ship、star（star 裁剪过透明边）
  }

  override ready() {
    this.add(new CornerMarkers())
    const safe = this.tree.viewport.safeRect
    this.add(new Label({ name: 'Title', text: 'sapling2d 示例', fontSize: 56, fontWeight: 'bold', align: 'center', position: v(375, safe.top + 60) }))
    this.add(new Label({ name: 'Hint', text: '点大球反转（闪红）· 拖动下面的球\n点空白处爆炸（帧动画）· 空格反转', fontSize: 28, color: 0xaee6ff, align: 'center', lineHeight: 40, position: v(375, safe.top + 140) }))
    this.add(new Counter({ text: '0 秒', fontSize: 72, color: 0xffd166, stroke: { color: 0x000000, width: 6 }, align: 'center', verticalAlign: 'center', position: v(375, 380) }))
    this.add(new Spinner({ name: 'Spinner', texture: Main.assets.fruit, position: v(375, 667), scale: v(1.5, 1.5) }))
    const row = this.add(new Node2D({ name: 'Row', position: v(375, 1100) }))
    for (let i = -2; i <= 2; i++) {
      row.add(new Draggable({ texture: Main.assets.fruit, position: v(i * 110, 0), zIndex: -Math.abs(i) }))
    }
    // 图集里的帧：和普通贴图一样用
    this.add(new Sprite2D({ name: 'Ship', texture: Main.assets.sprites.get('ship'), position: v(250, 900) }))
    this.add(new Sprite2D({ name: 'Star', texture: Main.assets.sprites.get('star'), position: v(500, 900) }))
  }

  override process() {
    // 点在空白处（没有被可点击节点处理）才会触发 spawn
    const input = this.tree.input
    if (input.isActionJustPressed('spawn') && input.pointerPosition) {
      // 一次性帧动画：播完（不循环）就销毁
      const fx = this.add(new AnimatedSprite2D({ name: 'Boom', frames: Main.assets.boom.frames(), fps: 16, loop: false, autoplay: true, position: input.pointerPosition }))
      fx.animationFinished.connect(() => fx.queueFree(), fx)
    }
  }
}

/** 两个平台共用的启动参数 */
export const gameOptions = {
  main: Main,
  background: 0x1e2a38,
  actions: { spawn: [pointerPress()], reverse: [key('Space')] },
}
