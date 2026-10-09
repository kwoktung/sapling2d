import type { ActionName } from '../core/actions'
import type { Texture } from '../core/assets'
import { Signal } from '../core/Signal'
import { Sprite2D, type Sprite2DOptions } from './Sprite2D'

export interface TouchScreenButtonOptions extends Sprite2DOptions {
  /** 按住时处于按下状态的输入动作（和键盘绑定共用同一个动作名）。不设置时只发信号。 */
  action?: ActionName
  /** 按下时显示的贴图。不设置时按下也显示 `texture`。 */
  texturePressed?: Texture | null
  /** 手指从按钮外滑进来也算按下（方向键常用），默认 false：只有在按钮上按下才算。滑出按钮总是松开。 */
  passbyPress?: boolean
}

/**
 * 屏幕按钮（虚拟按键）：手指按住时 `action` 处于按下状态，和键盘绑定同一个动作时两者都能触发。名字照搬 Godot。
 *
 * ```ts
 * // 启动参数：actions: { jump: [key('Space')] }
 * const hud = this.add(new CanvasLayer())
 * hud.add(new TouchScreenButton({ texture: Main.assets.jump, action: 'jump', position: v(680, 1200), hitArea: new Rect2(-80, -80, 160, 160) }))
 * ```
 *
 * - 触摸区域：设置了 `hitArea` 就用它（可以比贴图大），否则用贴图的范围。
 * - 多点触控：每个手指独立；同一个按钮被几个手指按住时，最后一个手指离开才松开。
 * - 手指滑出按钮、抬起、触摸取消、游戏切到后台时都会松开。
 * - 按在按钮上（或滑进 passbyPress 按钮）的手指不再触发 `pointerPress()` 绑定，也不会点中下面的节点；正在拖着节点的手指滑过按钮不会按下它。
 * - 按绘制顺序参与拾取：画在它上面的可点击节点（例如更高 CanvasLayer 里的对话框）先收到指针。
 * - 通常放在 CanvasLayer 里（固定在屏幕上）；隐藏、不能处理（暂停）时不能按下，按着的也会松开。
 */
export class TouchScreenButton extends Sprite2D {
  readonly action: ActionName | null
  texturePressed: Texture | null
  passbyPress: boolean
  /** 按下（第一个手指按住）时触发。 */
  readonly pressed = new Signal()
  /** 松开（最后一个手指离开）时触发。 */
  readonly released = new Signal()
  /** @internal 正按住它的指针 id（由 Input 维护）。 */
  readonly _pointerIds = new Set<number>()
  private _normalTexture: Texture | null = null

  constructor(options: TouchScreenButtonOptions = {}) {
    super(options)
    this.action = options.action ?? null
    this.texturePressed = options.texturePressed ?? null
    this.passbyPress = options.passbyPress ?? false
  }

  /** 是否有手指正按着它。 */
  get isPressed(): boolean {
    return this._pointerIds.size > 0
  }

  override _onEnterTree(): void {
    const input = this.tree.input
    // 不在这里抛错：进入树的过程中抛错会让节点停在“一半在树里”的状态
    if (this.action !== null && !input.hasAction(this.action)) {
      console.warn(`TouchScreenButton "${this.name}": unknown input action "${this.action}"; pressing it changes no action. Define it in the game options (actions: { ${this.action}: [] }) or with tree.input.addAction().`)
    }
    input._addButton(this)
  }

  override _onExitTree(): void {
    this.tree.input._removeButton(this)
  }

  /** @internal 由 Input 在第一个手指按住 / 最后一个手指离开时调用。 */
  _setPressed(pressed: boolean): void {
    if (pressed) {
      if (this.texturePressed) {
        this._normalTexture = this.texture
        this.texture = this.texturePressed
      }
      this.pressed.emit()
    } else {
      if (this.texturePressed && this.texture === this.texturePressed) this.texture = this._normalTexture
      this._normalTexture = null
      this.released.emit()
    }
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), action: this.action ?? undefined, pressed: this.isPressed || undefined }
  }
}
