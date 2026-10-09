import { Vector2 } from '../math/Vector2'
import type { ActionName } from './actions'
import type { CanvasLayerLike, Node } from './Node'
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
  /** 当前按下的指针（世界坐标）。 */
  private _pointers = new Map<number, Vector2>()
  /** 同一批指针在屏幕上的位置（设计坐标）：相机移动后，按它重新算出世界坐标。 */
  private _pointersDesign = new Map<number, Vector2>()
  /** 当前按下、且没有被任何节点处理的指针；只有它们会触发 pointer 绑定。 */
  private _unhandledPointers = new Set<number>()
  private _captures = new Map<number, Capture>()
  private _pointerPosition: Vector2 | null = null
  private _pointerPositionDesign: Vector2 | null = null
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
      const node = this._pick(position, design)
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

    if (e.type === 'pointermove') {
      if (this._pointers.has(id)) {
        this._pointers.set(id, position)
        this._pointersDesign.set(id, design)
      }
      target?.pointerMove.emit(event(id, position, design, target))
      return
    }

    // pointerup / pointercancel
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

  /** 按屏幕位置重新算按下的指针和最近指针位置的世界坐标（相机没动时不变）。 */
  private _refreshPointerWorld(): void {
    const vp = this._viewport
    for (const [id, design] of this._pointersDesign) this._pointers.set(id, vp.designToWorld(design))
    if (this._pointerPositionDesign) this._pointerPosition = vp.designToWorld(this._pointerPositionDesign)
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

  /** 绘制顺序最上层、可点击且命中的节点。CanvasLayer 里的节点按设计坐标（`design`）判断，场景里的按世界坐标。 */
  private _pick(world: Vector2, design: Vector2): Node2D | null {
    const order: Node2D[] = []
    const inLayer: boolean[] = []
    collectDrawOrder(this._topLevel(), order, inLayer)
    for (let i = order.length - 1; i >= 0; i--) {
      const n = order[i]!
      if (!n.inputPickable || n.isQueuedForDeletion || !n.isVisibleInTree || !n.canProcess()) continue
      // 缩放为 0 时变换不可逆：节点在屏幕上没有面积，不可能被点中（toLocal 会退化成原点，导致全屏误判）
      const inverse = n.globalTransform.inverse()
      if (inverse && n.hitTest(inverse.apply(inLayer[i] ? design : world))) return n
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

/** 节点收到的事件：CanvasLayer 里的节点拿到设计坐标，场景里的拿到世界坐标。 */
function event(pointerId: number, world: Vector2, design: Vector2, node: Node2D): PointerEvent2D {
  const position = node._canvasLayer ? design : world
  return { pointerId, position, localPosition: node.toLocal(position) }
}

/**
 * 与渲染层相同的绘制顺序（先画的在前）：layer < 0 的 CanvasLayer、场景（世界）、layer >= 0 的 CanvasLayer。
 * 同一 layer 的 CanvasLayer 按树的先序（不管 zIndex，嵌套的层紧跟在外层后面），和渲染层一致。
 * 每一层里是树的先序；非 Node2D 节点被展开到最近的 Node2D 祖先下；同一父容器内按 zIndex 稳定排序（zIndex 大的后画、在上层）。
 * `inLayer`（可选）和 `out` 一一对应：节点是否在某个 CanvasLayer 里。
 */
export function collectDrawOrder(nodes: readonly Node[], out: Node2D[], inLayer?: boolean[]): void {
  const layers: CanvasLayerLike[] = []
  collectLayers(nodes, layers)
  const sorted = layers.map((layer, index) => ({ layer, index })).sort((a, b) => a.layer.layer - b.layer.layer || a.index - b.index)
  const emit = (list: readonly Node[], flag: boolean) => {
    const start = out.length
    collectCanvas(list, out)
    if (inLayer) for (let i = start; i < out.length; i++) inLayer[i] = flag
  }
  for (const { layer } of sorted) if (layer.layer < 0) emit(layer.children, true)
  emit(nodes, false)
  for (const { layer } of sorted) if (layer.layer >= 0) emit(layer.children, true)
}

/** 树的先序里遇到的所有 CanvasLayer（包括嵌套的）。 */
function collectLayers(nodes: readonly Node[], out: CanvasLayerLike[]): void {
  for (const n of nodes) {
    if (n._isCanvasLayer) out.push(n as CanvasLayerLike)
    collectLayers(n.children, out)
  }
}

/** 一个画布（场景或一个 CanvasLayer）里的 Node2D，按绘制顺序；遇到 CanvasLayer 不展开（它自成一层）。 */
function collectCanvas(nodes: readonly Node[], out: Node2D[]): void {
  const slots: Node2D[] = []
  const flatten = (list: readonly Node[]) => {
    for (const n of list) {
      if (n._isCanvasLayer) continue
      if (n instanceof Node2D) slots.push(n)
      else flatten(n.children)
    }
  }
  flatten(nodes)
  const sorted = slots.map((n, i) => ({ n, i })).sort((a, b) => a.n.zIndex - b.n.zIndex || a.i - b.i)
  for (const { n } of sorted) {
    out.push(n)
    collectCanvas(n.children, out)
  }
}
