import { Vector2 } from '../math/Vector2'
import type { ActionName } from './actions'
import { collectDrawOrder } from './drawOrder'
import type { Node } from './Node'
import { Node2D } from './Node2D'
import type { PointerEvent2D } from './pointer'
import type { Viewport } from './Viewport'

/**
 * 平台产出的原始输入事件。指针坐标是窗口逻辑像素（与 ScreenInfo 一致），由引擎换算成设计坐标。
 * 键盘事件只有浏览器平台会产生。
 */
export type RawInputEvent =
  | { type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel'; pointerId: number; x: number; y: number }
  | { type: 'keydown' | 'keyup'; code: string }

/** 动作绑定：键盘按键（KeyboardEvent.code，如 'Space'、'KeyA'、'ArrowLeft'），或任意一次未被节点处理的指针按下。 */
export type InputBinding = { readonly type: 'key'; readonly code: string } | { readonly type: 'pointer' }

/** 键盘按键绑定。`code` 是 KeyboardEvent.code，如 'Space'、'KeyA'、'ArrowLeft'。 */
export function key(code: string): InputBinding {
  return { type: 'key', code }
}

/** 指针按下绑定：屏幕上任意位置的按下（被 inputPickable 节点处理掉的不算）。 */
export function pointerPress(): InputBinding {
  return { type: 'pointer' }
}

interface Capture {
  node: Node2D
}

/** 力度达到这个值时动作算按下（和 Godot 动作的默认死区一样）。 */
const PRESS_THRESHOLD = 0.5

/**
 * 输入系统，通过 `this.tree.input` 访问。
 *
 * 平台事件先进入队列，在每帧开始时（物理和 process 之前）统一处理，所以输入的效果是确定的：
 * 节点的指针信号在这时触发，`isActionJustPressed` 在这一整帧内为 true。
 * 在 `physicsProcess` 里，`isActionJustPressed` / `isActionJustReleased` 按物理帧算（和 Godot 一样）：
 * 上一个物理步之后按下的，在下一个物理步里为 true，一次按下只在一个物理步里为 true。
 * 屏幕刷新率高于 60Hz 时有的帧没有物理步，这样按键也不会丢。
 *
 * ```ts
 * // 启动参数：actions: { drop: [pointerPress(), key('Space')] }
 * override process() {
 *   if (this.tree.input.isActionJustPressed('drop')) this.drop()
 * }
 * ```
 */
export class Input {
  private readonly _viewport: Viewport
  private readonly _topLevel: () => readonly Node[]
  private _queue: RawInputEvent[] = []

  private _actions = new Map<string, InputBinding[]>()
  private _actionPressed = new Set<string>()
  private _actionJustPressed = new Set<string>()
  private _actionJustReleased = new Set<string>()
  /** 上一个物理步之后刚按下 / 刚松开的动作：`physicsProcess` 里查询的是它们。 */
  private _physicsJustPressed = new Set<string>()
  private _physicsJustReleased = new Set<string>()
  /** @internal SceneTree 在物理步期间（physicsProcess 和刚体的接触信号）设为 true。 */
  _inPhysics = false

  private _keysDown = new Set<string>()
  /** 当前按下的指针（世界坐标）。 */
  private _pointers = new Map<number, Vector2>()
  /** 同一批指针在屏幕上的位置（设计坐标）：相机移动后，按它重新算出世界坐标。 */
  private _pointersDesign = new Map<number, Vector2>()
  /** 当前按下、且没有被任何节点处理的指针；只有它们会触发 pointer 绑定。 */
  private _unhandledPointers = new Set<number>()
  private _captures = new Map<number, Capture>()
  private _pointerPosition: Vector2 | null = null
  private _pointerPositionDesign: Vector2 | null = null
  /** 树里的屏幕按钮（TouchScreenButton 进入树时登记）。 */
  private readonly _buttons: VirtualButton[] = []
  private readonly _buttonSet = new Set<Node2D>()
  /** 遍历按钮时用的副本（复用）：按钮的信号回调可能增删按钮。 */
  private readonly _buttonScratch: VirtualButton[] = []
  /** 动作名 → 正按着的屏幕按钮数：大于 0 时动作处于按下状态。 */
  private readonly _buttonCounts = new Map<string, number>()
  /** 树里的摇杆（TouchJoystick 进入树时登记）。 */
  private readonly _sticks: VirtualStick[] = []
  private readonly _stickSet = new Set<Node2D>()
  /** 按着摇杆的指针 → 摇杆：这个手指的移动和抬起只交给摇杆。 */
  private readonly _stickPointers = new Map<number, VirtualStick>()
  /** 动作名 → 力度（0–1），每次更新动作状态时算好。 */
  private readonly _strength = new Map<string, number>()
  private _pointerJustPressed = false
  private _pointerJustReleased = false

  /** @internal */
  constructor(viewport: Viewport, topLevel: () => readonly Node[]) {
    this._viewport = viewport
    this._topLevel = topLevel
  }

  // ---------------------------------------------------------------- 动作

  /** 定义（或覆盖）一个动作。也可以在启动参数 `actions` 里一次性定义。 */
  addAction(name: ActionName, bindings: InputBinding[]): void {
    this._actions.set(name, [...bindings])
  }

  removeAction(name: ActionName): void {
    this._actions.delete(name)
    this._actionPressed.delete(name)
    this._actionJustPressed.delete(name)
    this._actionJustReleased.delete(name)
    this._physicsJustPressed.delete(name)
    this._physicsJustReleased.delete(name)
    this._strength.delete(name)
  }

  hasAction(name: ActionName): boolean {
    return this._actions.has(name)
  }

  /** 动作当前是否处于按下状态：任意一个绑定按下，或者力度 ≥ 0.5（摇杆推过一半）。 */
  isActionPressed(name: ActionName): boolean {
    this._assertAction(name)
    return this._actionPressed.has(name)
  }

  /** 动作是否在本帧刚被按下（在 `physicsProcess` 里：是否在上一个物理步之后刚被按下）。 */
  isActionJustPressed(name: ActionName): boolean {
    this._assertAction(name)
    return (this._inPhysics ? this._physicsJustPressed : this._actionJustPressed).has(name)
  }

  /** 动作是否在本帧刚被松开（在 `physicsProcess` 里：是否在上一个物理步之后刚被松开）。 */
  isActionJustReleased(name: ActionName): boolean {
    this._assertAction(name)
    return (this._inPhysics ? this._physicsJustReleased : this._actionJustReleased).has(name)
  }

  /**
   * 动作的力度，0–1：按键、`pointerPress()`、屏幕按钮按下时是 1；摇杆按推动的程度给出 0–1（已经扣掉死区）。
   * 几个来源同时作用时取最大的。力度 ≥ 0.5 时动作算按下（`isActionPressed`）。
   */
  getActionStrength(name: ActionName): number {
    this._assertAction(name)
    return this._strength.get(name) ?? 0
  }

  /** 一条轴：`positive` 的力度减去 `negative` 的力度，-1 到 1。不分配内存。 */
  getAxis(negative: ActionName, positive: ActionName): number {
    return this.getActionStrength(positive) - this.getActionStrength(negative)
  }

  /**
   * 方向向量：x 是 `getAxis(negX, posX)`，y 是 `getAxis(negY, posY)`（y 向下为正），长度超过 1 时缩到 1
   * （键盘斜着按不会更快）。摇杆和键盘都走这里，游戏不用区分。
   * 每次调用分配一个 Vector2：每帧调用一次没有问题，热循环里用 `getAxis`。
   *
   * ```ts
   * const dir = this.tree.input.getVector('left', 'right', 'up', 'down')
   * this.setVelocity(dir.x * SPEED, dir.y * SPEED)
   * ```
   */
  getVector(negX: ActionName, posX: ActionName, negY: ActionName, posY: ActionName): Vector2 {
    let x = this.getAxis(negX, posX)
    let y = this.getAxis(negY, posY)
    const len = Math.sqrt(x * x + y * y)
    if (len > 1) {
      x /= len
      y /= len
    }
    return new Vector2(x, y)
  }

  /** @internal 每个物理步结束时由 SceneTree 调用。 */
  _endPhysicsStep(): void {
    this._physicsJustPressed.clear()
    this._physicsJustReleased.clear()
  }

  // ---------------------------------------------------------------- 原始状态

  /** 键盘按键是否按下（只有浏览器平台有键盘）。 */
  isKeyPressed(code: string): boolean {
    return this._keysDown.has(code)
  }

  /** 最近一次指针事件的位置（世界坐标，没有相机时就是设计坐标）；还没有任何指针事件时为 null。 */
  get pointerPosition(): Vector2 | null {
    return this._pointerPosition
  }

  /** 是否有指针处于按下状态。 */
  get isPointerPressed(): boolean {
    return this._pointers.size > 0
  }

  /** 本帧是否有指针按下。 */
  get isPointerJustPressed(): boolean {
    return this._pointerJustPressed
  }

  /** 本帧是否有指针抬起。 */
  get isPointerJustReleased(): boolean {
    return this._pointerJustReleased
  }

  /** 当前按下的所有指针：id → 位置（世界坐标，没有相机时就是设计坐标）。 */
  get pressedPointers(): ReadonlyMap<number, Vector2> {
    return this._pointers
  }

  // ---------------------------------------------------------------- 内部

  /** @internal 平台事件入队。 */
  _enqueue(event: RawInputEvent): void {
    this._queue.push(event)
  }

  /** @internal 每帧开始时由 SceneTree 调用：清掉上一帧的 just 状态，按顺序处理队列。 */
  _flush(): void {
    this._actionJustPressed.clear()
    this._actionJustReleased.clear()
    this._pointerJustPressed = false
    this._pointerJustReleased = false
    // 相机在上一帧末尾可能移动了：手指没动，它下面的世界坐标也变了
    this._refreshPointerWorld()
    // 按着的按钮变得不能按（隐藏、暂停、被移除）时松开；动作状态在这里统一更新，所有节点在同一帧看到变化
    this._releaseUnusableButtons()
    this._updateActions()
    const queue = this._queue
    this._queue = []
    for (const e of queue) {
      this._handle(e)
      this._updateActions()
    }
  }

  private _handle(e: RawInputEvent): void {
    if ('code' in e) {
      if (e.type === 'keydown') this._keysDown.add(e.code)
      else this._keysDown.delete(e.code)
      return
    }

    // 世界坐标：和节点的全局坐标相同（有相机时随相机平移）
    const design = this._viewport.screenToDesign(new Vector2(e.x, e.y))
    const position = this._viewport.designToWorld(design)
    this._pointerPosition = position
    this._pointerPositionDesign = design
    const id = e.pointerId

    if (e.type === 'pointerdown') {
      this._pointers.set(id, position)
      this._pointersDesign.set(id, design)
      this._pointerJustPressed = true
      // 按绘制顺序找最上面的：是屏幕按钮就交给按钮（不点中下面的节点，也不触发 pointerPress() 绑定）
      const node = this._pick(position, design)
      if (node && this._buttonSet.has(node)) {
        this._pressButtonsAt(id, position, design, false)
        return
      }
      if (node && this._stickSet.has(node)) {
        const stick = node as VirtualStick
        this._stickPointers.set(id, stick)
        stick._press(id, stick._canvasLayer ? design : position)
        return
      }
      if (node) {
        this._captures.set(id, { node })
        node.pointerDown.emit(event(id, position, design, node))
      } else {
        this._unhandledPointers.add(id)
      }
      return
    }

    if (!this._pointers.has(id) && e.type !== 'pointermove') return
    const capture = this._captures.get(id)
    const target = capture && capture.node.isInsideTree && !capture.node.isFreed ? capture.node : null

    const stick = this._stickPointers.get(id)
    if (e.type === 'pointermove') {
      if (stick) {
        // 按着摇杆的手指只拖摇杆：不滑进别的按钮
        this._pointers.set(id, position)
        this._pointersDesign.set(id, design)
        stick._drag(stick._canvasLayer ? design : position)
        return
      }
      if (this._pointers.has(id)) {
        this._pointers.set(id, position)
        this._pointersDesign.set(id, design)
        this._moveOnButtons(id, position, design)
      }
      target?.pointerMove.emit(event(id, position, design, target))
      return
    }

    // pointerup / pointercancel
    if (stick) {
      this._stickPointers.delete(id)
      if (stick._pointerId === id) stick._release()
    }
    this._releaseButtons(id)
    this._pointers.delete(id)
    this._pointersDesign.delete(id)
    this._unhandledPointers.delete(id)
    this._captures.delete(id)
    this._pointerJustReleased = true
    if (target) {
      const ev = event(id, position, design, target)
      target.pointerUp.emit(ev)
      if (e.type === 'pointerup' && target.hitTest(ev.localPosition)) target.clicked.emit(ev)
    }
  }

  // ---------------------------------------------------------------- 屏幕按钮

  /** @internal TouchScreenButton 进入树时调用。 */
  _addButton(button: VirtualButton): void {
    this._buttons.push(button)
    this._buttonSet.add(button)
  }

  /** @internal TouchScreenButton 离开树时调用：按着的话松开（动作状态在下一帧开始时更新）。 */
  _removeButton(button: VirtualButton): void {
    const i = this._buttons.indexOf(button)
    if (i >= 0) this._buttons.splice(i, 1)
    this._buttonSet.delete(button)
    if (button._pointerIds.size > 0) {
      button._pointerIds.clear()
      this._buttonReleased(button)
    }
  }

  /** @internal TouchJoystick 进入树时调用。 */
  _addStick(stick: VirtualStick): void {
    this._sticks.push(stick)
    this._stickSet.add(stick)
  }

  /** @internal TouchJoystick 离开树时调用：按着的话松开（动作状态在下一帧开始时更新）。 */
  _removeStick(stick: VirtualStick): void {
    const i = this._sticks.indexOf(stick)
    if (i >= 0) this._sticks.splice(i, 1)
    this._stickSet.delete(stick)
    this._releaseStick(stick)
  }

  /** 松开摇杆（之后这个手指就是一个普通的、没被处理的按着的手指，但不再触发 pointerPress()）。 */
  private _releaseStick(stick: VirtualStick): void {
    const id = stick._pointerId
    if (id === null) return
    this._stickPointers.delete(id)
    stick._release()
  }

  /**
   * @internal 游戏切到后台：松开所有按下的指针和按键（排队成取消 / 松开事件，下一帧开始时按顺序处理）。
   * 还在队列里、没处理的按下也算：它们的抬起在后台收不到。
   */
  _releaseAll(): void {
    const pointers = new Map<number, { x: number; y: number }>()
    for (const [id, design] of this._pointersDesign) pointers.set(id, this._viewport.designToScreen(design))
    const keys = new Set(this._keysDown)
    for (const e of this._queue) {
      if (e.type === 'pointerdown') pointers.set(e.pointerId, { x: e.x, y: e.y })
      else if (e.type === 'keydown') keys.add(e.code)
    }
    for (const [id, p] of pointers) this._queue.push({ type: 'pointercancel', pointerId: id, x: p.x, y: p.y })
    for (const code of keys) this._queue.push({ type: 'keyup', code })
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

  /** 手指移动：滑出的按钮松开；没有拖着节点的手指滑进允许滑入的按钮时按下（之后它不再算 pointerPress() 的按下）。 */
  private _moveOnButtons(id: number, world: Vector2, design: Vector2): void {
    const buttons = this._snapshotButtons()
    let passby = false
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i]!
      if (button.passbyPress) passby = true
      if (!button._pointerIds.has(id) || !this._buttonSet.has(button) || hitsAt(button, world, design)) continue
      button._pointerIds.delete(id)
      if (button._pointerIds.size === 0) this._buttonReleased(button)
    }
    if (passby && !this._captures.has(id) && this._pressButtonsAt(id, world, design, true)) this._unhandledPointers.delete(id)
  }

  private _releaseButtons(id: number): void {
    const buttons = this._snapshotButtons()
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i]!
      if (!button._pointerIds.delete(id)) continue
      if (button._pointerIds.size === 0) this._buttonReleased(button)
    }
  }

  /** 按着的按钮、摇杆变得不能按（隐藏、暂停、等待销毁）时松开。每帧开始时调用，平时只是一个遍历。 */
  private _releaseUnusableButtons(): void {
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

  private _buttonPressed(button: VirtualButton): void {
    if (button.action !== null) this._buttonCounts.set(button.action, (this._buttonCounts.get(button.action) ?? 0) + 1)
    button._setPressed(true)
  }

  private _buttonReleased(button: VirtualButton): void {
    if (button.action !== null) this._buttonCounts.set(button.action, (this._buttonCounts.get(button.action) ?? 1) - 1)
    button._setPressed(false)
  }

  /** 按屏幕位置重新算按下的指针和最近指针位置的世界坐标（相机没动时不变）。 */
  private _refreshPointerWorld(): void {
    const vp = this._viewport
    for (const [id, design] of this._pointersDesign) this._pointers.set(id, vp.designToWorld(design))
    if (this._pointerPositionDesign) this._pointerPosition = vp.designToWorld(this._pointerPositionDesign)
  }

  private _updateActions(): void {
    const sticks = this._sticks
    for (const [name, bindings] of this._actions) {
      let strength = (this._buttonCounts.get(name) ?? 0) > 0 ? 1 : 0
      for (let i = 0; strength < 1 && i < bindings.length; i++) {
        const b = bindings[i]!
        if (b.type === 'key' ? this._keysDown.has(b.code) : this._unhandledPointers.size > 0) strength = 1
      }
      for (let i = 0; strength < 1 && i < sticks.length; i++) {
        const s = sticks[i]!._strengthOf(name)
        if (s > strength) strength = s
      }
      this._strength.set(name, strength)
      const pressed = strength >= PRESS_THRESHOLD
      const was = this._actionPressed.has(name)
      if (pressed && !was) {
        this._actionPressed.add(name)
        this._actionJustPressed.add(name)
        this._physicsJustPressed.add(name)
      } else if (!pressed && was) {
        this._actionPressed.delete(name)
        this._actionJustReleased.add(name)
        this._physicsJustReleased.add(name)
      }
    }
  }

  /**
   * 绘制顺序最上层、命中的节点：可点击的节点（`inputPickable`）或屏幕按钮。
   * CanvasLayer 里的节点按设计坐标（`design`）判断，场景里的按世界坐标。
   */
  private _pick(world: Vector2, design: Vector2): Node2D | null {
    const order: Node2D[] = []
    const inLayer: boolean[] = []
    collectDrawOrder(this._topLevel(), order, inLayer)
    for (let i = order.length - 1; i >= 0; i--) {
      const n = order[i]!
      if (this._stickSet.has(n)) {
        if (canHit(n) && (n as VirtualStick)._accepts(inLayer[i] ? design : world)) return n
        continue
      }
      if (!n.inputPickable && !this._buttonSet.has(n)) continue
      if (hitsAt(n, world, design, inLayer[i])) return n
    }
    return null
  }

  private _assertAction(name: string): void {
    if (!this._actions.has(name)) {
      const known = [...this._actions.keys()]
      throw new Error(`Unknown input action "${name}". Define it in the game options (actions: { ${name}: [...] }) or with tree.input.addAction(). Known actions: ${known.length ? known.join(', ') : '(none)'}.`)
    }
  }
}

/** Input 用到的 TouchScreenButton 字段（core 不依赖 nodes/）。 */
interface VirtualButton extends Node2D {
  readonly action: string | null
  readonly passbyPress: boolean
  readonly _pointerIds: Set<number>
  _setPressed(pressed: boolean): void
}

/** Input 用到的 TouchJoystick 成员（core 不依赖 nodes/）。坐标：在 CanvasLayer 里是设计坐标，否则是世界坐标。 */
interface VirtualStick extends Node2D {
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

/** 节点现在能不能接收指针（没有等待销毁、在树里可见、能处理）。 */
function canHit(n: Node2D): boolean {
  return !n.isQueuedForDeletion && n.isVisibleInTree && n.canProcess()
}

/**
 * 节点能不能被点中、指针在不在它的点击区域里：节点拾取和屏幕按钮共用。
 * CanvasLayer 里的节点按设计坐标判断（`inLayer` 不传时自己找）。
 */
function hitsAt(n: Node2D, world: Vector2, design: Vector2, inLayer?: boolean): boolean {
  if (!canHit(n)) return false
  // 缩放为 0 时变换不可逆：节点在屏幕上没有面积，不可能被点中（toLocal 会退化成原点，导致全屏误判）
  const inverse = n.globalTransform.inverse()
  if (!inverse) return false
  return n.hitTest(inverse.apply((inLayer ?? n._canvasLayer !== null) ? design : world))
}

/** 节点收到的事件：CanvasLayer 里的节点拿到设计坐标，场景里的拿到世界坐标。 */
function event(pointerId: number, world: Vector2, design: Vector2, node: Node2D): PointerEvent2D {
  const position = node._canvasLayer ? design : world
  return { pointerId, position, localPosition: node.toLocal(position) }
}
