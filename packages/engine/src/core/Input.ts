import { Vector2 } from '../math/Vector2'
import type { ActionName } from './actions'
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
  /** 当前按下的指针（设计坐标）。 */
  private _pointers = new Map<number, Vector2>()
  /** 当前按下、且没有被任何节点处理的指针；只有它们会触发 pointer 绑定。 */
  private _unhandledPointers = new Set<number>()
  private _captures = new Map<number, Capture>()
  private _pointerPosition: Vector2 | null = null
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
  }

  hasAction(name: ActionName): boolean {
    return this._actions.has(name)
  }

  /** 动作当前是否处于按下状态（任意一个绑定按下即可）。 */
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

  /** 最近一次指针事件的位置（设计坐标）；还没有任何指针事件时为 null。 */
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

  /** 当前按下的所有指针：id → 位置（设计坐标）。 */
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

    const position = this._viewport.screenToDesign(new Vector2(e.x, e.y))
    this._pointerPosition = position
    const id = e.pointerId

    if (e.type === 'pointerdown') {
      this._pointers.set(id, position)
      this._pointerJustPressed = true
      const node = this._pick(position)
      if (node) {
        this._captures.set(id, { node })
        node.pointerDown.emit(event(id, position, node))
      } else {
        this._unhandledPointers.add(id)
      }
      return
    }

    if (!this._pointers.has(id) && e.type !== 'pointermove') return
    const capture = this._captures.get(id)
    const target = capture && capture.node.isInsideTree && !capture.node.isFreed ? capture.node : null

    if (e.type === 'pointermove') {
      if (this._pointers.has(id)) this._pointers.set(id, position)
      target?.pointerMove.emit(event(id, position, target))
      return
    }

    // pointerup / pointercancel
    this._pointers.delete(id)
    this._unhandledPointers.delete(id)
    this._captures.delete(id)
    this._pointerJustReleased = true
    if (target) {
      const ev = event(id, position, target)
      target.pointerUp.emit(ev)
      if (e.type === 'pointerup' && target.hitTest(ev.localPosition)) target.clicked.emit(ev)
    }
  }

  private _updateActions(): void {
    for (const [name, bindings] of this._actions) {
      const pressed = bindings.some((b) => (b.type === 'key' ? this._keysDown.has(b.code) : this._unhandledPointers.size > 0))
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

  /** 绘制顺序最上层、可点击且命中的节点。 */
  private _pick(position: Vector2): Node2D | null {
    const order: Node2D[] = []
    collectDrawOrder(this._topLevel(), order)
    for (let i = order.length - 1; i >= 0; i--) {
      const n = order[i]!
      if (!n.inputPickable || n.isQueuedForDeletion || !n.isVisibleInTree || !n.canProcess()) continue
      // 缩放为 0 时变换不可逆：节点在屏幕上没有面积，不可能被点中（toLocal 会退化成原点，导致全屏误判）
      const inverse = n.globalTransform.inverse()
      if (inverse && n.hitTest(inverse.apply(position))) return n
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

function event(pointerId: number, position: Vector2, node: Node2D): PointerEvent2D {
  return { pointerId, position, localPosition: node.toLocal(position) }
}

/**
 * 与渲染层相同的绘制顺序：树的先序；非 Node2D 节点被展开到最近的 Node2D 祖先下；
 * 同一父容器内按 zIndex 稳定排序（zIndex 大的后画、在上层）。
 */
export function collectDrawOrder(nodes: readonly Node[], out: Node2D[]): void {
  const slots: Node2D[] = []
  const flatten = (list: readonly Node[]) => {
    for (const n of list) {
      if (n instanceof Node2D) slots.push(n)
      else flatten(n.children)
    }
  }
  flatten(nodes)
  const sorted = slots.map((n, i) => ({ n, i })).sort((a, b) => a.n.zIndex - b.n.zIndex || a.i - b.i)
  for (const { n } of sorted) {
    out.push(n)
    collectDrawOrder(n.children, out)
  }
}
