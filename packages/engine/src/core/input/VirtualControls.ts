import type { Vector2 } from '../../math/Vector2'
import type { Node2D } from '../Node2D'
import { canHit, hitsAt } from './hit'

/** 用到的 TouchScreenButton 字段（core 不依赖 nodes/）。 */
export interface VirtualButton extends Node2D {
  readonly action: string | null
  readonly passbyPress: boolean
  readonly _pointerIds: Set<number>
  _setPressed(pressed: boolean): void
}

/** 用到的 TouchJoystick 成员（core 不依赖 nodes/）。坐标：在 CanvasLayer 里是设计坐标，否则是世界坐标。 */
export interface VirtualStick extends Node2D {
  /** 按着它的指针，没有按着时为 null。 */
  readonly _pointerId: number | null
  /** 这个位置的按下归不归它（没按着、在触摸区域里）。 */
  _accepts(point: Vector2): boolean
  _press(pointerId: number, point: Vector2): void
  _drag(point: Vector2): void
  _release(): void
  /** 它给动作 `action` 的力度（0–1），和它无关的动作是 0。 */
  _strengthOf(action: string): number
}

/**
 * 屏幕控件：屏幕按钮（TouchScreenButton）和摇杆（TouchJoystick）。登记树里的控件，管理哪些手指按着哪个控件，
 * 并给动作提供力度。指针怎么分发由 `PointerRouter` 决定，它在按下、移动、抬起时调用这里。
 *
 * - 按钮：多个手指可以同时按一个按钮；一个手指可以同时按下它下面的几个按钮；`passbyPress` 的按钮可以滑进去按下
 * - 摇杆：一个手指按住后独占，之后的移动和抬起只交给摇杆
 */
export class VirtualControls {
  private readonly _buttons: VirtualButton[] = []
  private readonly _buttonSet = new Set<Node2D>()
  /** 遍历按钮时用的副本（复用）：按钮的信号回调可能增删按钮。 */
  private readonly _buttonScratch: VirtualButton[] = []
  /** 动作名 → 正按着的屏幕按钮数：大于 0 时动作处于按下状态。 */
  private readonly _buttonCounts = new Map<string, number>()
  private readonly _sticks: VirtualStick[] = []
  private readonly _stickSet = new Set<Node2D>()
  /** 按着摇杆的指针 → 摇杆：这个手指的移动和抬起只交给摇杆。 */
  private readonly _stickPointers = new Map<number, VirtualStick>()

  // ---------------------------------------------------------------- 登记

  /** TouchScreenButton 进入树时调用。 */
  addButton(button: VirtualButton): void {
    this._buttons.push(button)
    this._buttonSet.add(button)
  }

  /** TouchScreenButton 离开树时调用：按着的话松开（动作状态在下一帧开始时更新）。 */
  removeButton(button: VirtualButton): void {
    const i = this._buttons.indexOf(button)
    if (i >= 0) this._buttons.splice(i, 1)
    this._buttonSet.delete(button)
    if (button._pointerIds.size > 0) {
      button._pointerIds.clear()
      this._buttonReleased(button)
    }
  }

  /** TouchJoystick 进入树时调用。 */
  addStick(stick: VirtualStick): void {
    this._sticks.push(stick)
    this._stickSet.add(stick)
  }

  /** TouchJoystick 离开树时调用：按着的话松开（动作状态在下一帧开始时更新）。 */
  removeStick(stick: VirtualStick): void {
    const i = this._sticks.indexOf(stick)
    if (i >= 0) this._sticks.splice(i, 1)
    this._stickSet.delete(stick)
    this._releaseStick(stick)
  }

  // ---------------------------------------------------------------- 由 PointerRouter 调用

  /** `n` 是不是屏幕控件（拾取到它时按下交给这里，不点中下面的节点）。 */
  isControl(n: Node2D): boolean {
    return this._buttonSet.has(n) || this._stickSet.has(n)
  }

  /** 拾取：控件 `n` 能不能在这个位置被按下。`inLayer`：`n` 在 CanvasLayer 里（按设计坐标）。 */
  hits(n: Node2D, world: Vector2, design: Vector2, inLayer: boolean): boolean {
    if (this._stickSet.has(n)) return canHit(n) && (n as VirtualStick)._accepts(inLayer ? design : world)
    return hitsAt(n, world, design, inLayer)
  }

  /** 手指 `id` 在控件 `n`（拾取到的最上层）上按下。 */
  press(id: number, n: Node2D, world: Vector2, design: Vector2): void {
    if (this._stickSet.has(n)) {
      const stick = n as VirtualStick
      this._stickPointers.set(id, stick)
      stick._press(id, stick._canvasLayer ? design : world)
      return
    }
    this._pressButtonsAt(id, world, design, false)
  }

  /** 手指 `id` 是否按着摇杆（它的移动只交给 `drag`）。 */
  ownsPointer(id: number): boolean {
    return this._stickPointers.has(id)
  }

  /** 按着摇杆的手指移动：只拖摇杆，不滑进别的按钮。 */
  drag(id: number, world: Vector2, design: Vector2): void {
    const stick = this._stickPointers.get(id)!
    stick._drag(stick._canvasLayer ? design : world)
  }

  /**
   * 普通手指移动：滑出的按钮松开；没有拖着节点（`captured` 为 false）的手指滑进允许滑入的按钮时按下。
   * 返回是否滑进了按钮（之后它不再算 pointerPress() 的按下）。
   */
  move(id: number, world: Vector2, design: Vector2, captured: boolean): boolean {
    const buttons = this._snapshotButtons()
    let passby = false
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i]!
      if (button.passbyPress) passby = true
      if (!button._pointerIds.has(id) || !this._buttonSet.has(button) || hitsAt(button, world, design)) continue
      button._pointerIds.delete(id)
      if (button._pointerIds.size === 0) this._buttonReleased(button)
    }
    return passby && !captured && this._pressButtonsAt(id, world, design, true)
  }

  /** 手指 `id` 抬起或取消：松开它按着的摇杆和按钮。 */
  release(id: number): void {
    const stick = this._stickPointers.get(id)
    if (stick) {
      this._stickPointers.delete(id)
      if (stick._pointerId === id) stick._release()
    }
    const buttons = this._snapshotButtons()
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i]!
      if (!button._pointerIds.delete(id)) continue
      if (button._pointerIds.size === 0) this._buttonReleased(button)
    }
  }

  /** 按着的按钮、摇杆变得不能按（隐藏、暂停、等待销毁）时松开。每帧开始时调用，平时只是一个遍历。 */
  releaseUnusable(): void {
    for (let i = 0; i < this._sticks.length; i++) {
      const stick = this._sticks[i]!
      if (stick._pointerId !== null && !canHit(stick)) this._releaseStick(stick)
    }
    for (let i = 0; i < this._buttons.length; i++) {
      const button = this._buttons[i]!
      if (button._pointerIds.size === 0 || canHit(button)) continue
      button._pointerIds.clear()
      this._buttonReleased(button)
      i = -1 // 信号回调可能增删了按钮：从头再看一遍（已经松开的会被跳过）
    }
  }

  // ---------------------------------------------------------------- 动作力度

  /** 正按着、绑定动作 `action` 的按钮数。 */
  buttonCount(action: string): number {
    return this._buttonCounts.get(action) ?? 0
  }

  /** 摇杆给动作 `action` 的力度：从 `floor` 开始取所有摇杆里最大的（到 1 为止）。 */
  stickStrength(action: string, floor: number): number {
    let strength = floor
    const sticks = this._sticks
    for (let i = 0; strength < 1 && i < sticks.length; i++) {
      const s = sticks[i]!._strengthOf(action)
      if (s > strength) strength = s
    }
    return strength
  }

  // ---------------------------------------------------------------- 内部

  /** 松开摇杆（之后这个手指就是一个普通的、没被处理的按着的手指，但不再触发 pointerPress()）。 */
  private _releaseStick(stick: VirtualStick): void {
    const id = stick._pointerId
    if (id === null) return
    this._stickPointers.delete(id)
    stick._release()
  }

  /** 当前按钮的副本（复用的数组）：遍历时信号回调增删按钮也不会漏掉或多算。 */
  private _snapshotButtons(): VirtualButton[] {
    const out = this._buttonScratch
    out.length = 0
    for (let i = 0; i < this._buttons.length; i++) out.push(this._buttons[i]!)
    return out
  }

  /** 指针 `id` 下面能按的按钮都按下（`passbyOnly`：只按允许滑入的）。返回是否按到了按钮。 */
  private _pressButtonsAt(id: number, world: Vector2, design: Vector2, passbyOnly: boolean): boolean {
    let hit = false
    const buttons = this._snapshotButtons()
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i]!
      if (!this._buttonSet.has(button) || button._pointerIds.has(id) || (passbyOnly && !button.passbyPress) || !hitsAt(button, world, design)) continue
      hit = true
      button._pointerIds.add(id)
      if (button._pointerIds.size === 1) this._buttonPressed(button)
    }
    return hit
  }

  private _buttonPressed(button: VirtualButton): void {
    if (button.action !== null) this._buttonCounts.set(button.action, (this._buttonCounts.get(button.action) ?? 0) + 1)
    button._setPressed(true)
  }

  private _buttonReleased(button: VirtualButton): void {
    if (button.action !== null) this._buttonCounts.set(button.action, (this._buttonCounts.get(button.action) ?? 1) - 1)
    button._setPressed(false)
  }
}
