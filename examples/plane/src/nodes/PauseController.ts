import { Label, Node2D, rect, Sprite2D, v } from 'sapling2d'
import { ASSETS } from '../assets'

/**
 * 暂停：显示半透明遮罩和提示，`tree.paused = true` 让战场静止。
 * 自己是 processMode 'always'：暂停时仍然能收到键盘和点击，用来恢复。
 */
export class PauseController extends Node2D {
  private _dim!: Sprite2D

  constructor() {
    super({ name: 'Pause', processMode: 'always', visible: false, inputPickable: true })
  }

  override ready() {
    // 纯白方块拉伸成全屏、染黑、半透明（引擎还没有画矩形的节点）
    this._dim = this.add(new Sprite2D({ texture: ASSETS.sprites.get('white'), centered: false, modulate: 0x000000, alpha: 0.55 }))
    this.add(new Label({ name: 'Hint', text: '暂停\n点击屏幕继续', fontSize: 56, fontWeight: 'bold', color: 0xffffff, align: 'center', verticalAlign: 'center', lineHeight: 84, position: v(375, 640) }))
    this.clicked.connect(() => this.resume(), this)
    this._layout()
    this.tree.viewport.resized.connect(() => this._layout(), this)
  }

  override process() {
    if (this.tree.input.isActionJustPressed('pause')) {
      if (this.tree.paused) this.resume()
      else this.pause()
    }
  }

  pause() {
    this.tree.paused = true
    this.visible = true
  }

  resume() {
    this.tree.paused = false
    this.visible = false
  }

  private _layout() {
    const r = this.tree.viewport.visibleRect
    this.hitArea = rect(r.left, r.top, r.width, r.height)
    this._dim.position = v(r.left, r.top)
    this._dim.scale = v(r.width / 8, r.height / 8) // white 是 8×8
  }
}
