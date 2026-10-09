import { CanvasLayer, Rect2, TouchScreenButton, v } from 'sapling2d'
import { ASSETS } from '../assets'

/** 触摸区域比按钮图（40×40）大：手指粗，按偏一点也算。 */
const PAD = new Rect2(-30, -30, 60, 60)

/** 屏幕按钮：左、右（手指滑过去不用抬起）、跳。浏览器里也显示，键盘同样可用。 */
export class Controls extends CanvasLayer {
  readonly left = new TouchScreenButton({ name: 'Left', action: 'left', texture: ASSETS.btnLeft, hitArea: PAD, passbyPress: true, alpha: 0.55 })
  readonly right = new TouchScreenButton({ name: 'Right', action: 'right', texture: ASSETS.btnRight, hitArea: PAD, passbyPress: true, alpha: 0.55 })
  readonly jump = new TouchScreenButton({ name: 'Jump', action: 'jump', texture: ASSETS.btnJump, hitArea: new Rect2(-40, -40, 80, 80), alpha: 0.55 })

  constructor() {
    super({ name: 'Controls', layer: 20 })
  }

  override ready() {
    this.add(this.left)
    this.add(this.right)
    this.add(this.jump)
    this._layout()
    this.tree.viewport.resized.connect(() => this._layout(), this)
  }

  /** 贴着安全区的左下角和右下角。 */
  private _layout() {
    const r = this.tree.viewport.safeRect
    this.left.position = v(r.left + 36, r.bottom - 34)
    this.right.position = v(r.left + 96, r.bottom - 34)
    this.jump.position = v(r.right - 44, r.bottom - 38)
  }
}
