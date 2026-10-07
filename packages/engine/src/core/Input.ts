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
 *
 * ```ts
 * // 启动参数：actions: { drop: [pointerPress(), key('Space')] }
 * override process() {
 *   if (this.tree.input.isActionJustPressed('drop')) this.drop()
 * }
 * ```
 */
export class Input {
  readonly #viewport: Viewport
  readonly #topLevel: () => readonly Node[]
  #queue: RawInputEvent[] = []

  #actions = new Map<string, InputBinding[]>()
  #actionPressed = new Set<string>()
  #actionJustPressed = new Set<string>()
  #actionJustReleased = new Set<string>()

  #keysDown = new Set<string>()
  /** 当前按下的指针（设计坐标）。 */
  #pointers = new Map<number, Vector2>()
  /** 当前按下、且没有被任何节点处理的指针；只有它们会触发 pointer 绑定。 */
  #unhandledPointers = new Set<number>()
  #captures = new Map<number, Capture>()
  #pointerPosition: Vector2 | null = null
  #pointerJustPressed = false
  #pointerJustReleased = false

  /** @internal */
  constructor(viewport: Viewport, topLevel: () => readonly Node[]) {
    this.#viewport = viewport
    this.#topLevel = topLevel
  }

  // ---------------------------------------------------------------- 动作

  /** 定义（或覆盖）一个动作。也可以在启动参数 `actions` 里一次性定义。 */
  addAction(name: ActionName, bindings: InputBinding[]): void {
    this.#actions.set(name, [...bindings])
  }

  removeAction(name: ActionName): void {
    this.#actions.delete(name)
    this.#actionPressed.delete(name)
  }

  hasAction(name: ActionName): boolean {
    return this.#actions.has(name)
  }

  /** 动作当前是否处于按下状态（任意一个绑定按下即可）。 */
  isActionPressed(name: ActionName): boolean {
    this.#assertAction(name)
    return this.#actionPressed.has(name)
  }

  /** 动作是否在本帧刚被按下。 */
  isActionJustPressed(name: ActionName): boolean {
    this.#assertAction(name)
    return this.#actionJustPressed.has(name)
  }

  /** 动作是否在本帧刚被松开。 */
  isActionJustReleased(name: ActionName): boolean {
    this.#assertAction(name)
    return this.#actionJustReleased.has(name)
  }

  // ---------------------------------------------------------------- 原始状态

  /** 键盘按键是否按下（只有浏览器平台有键盘）。 */
  isKeyPressed(code: string): boolean {
    return this.#keysDown.has(code)
  }

  /** 最近一次指针事件的位置（设计坐标）；还没有任何指针事件时为 null。 */
  get pointerPosition(): Vector2 | null {
    return this.#pointerPosition
  }

  /** 是否有指针处于按下状态。 */
  get isPointerPressed(): boolean {
    return this.#pointers.size > 0
  }

  /** 本帧是否有指针按下。 */
  get isPointerJustPressed(): boolean {
    return this.#pointerJustPressed
  }

  /** 本帧是否有指针抬起。 */
  get isPointerJustReleased(): boolean {
    return this.#pointerJustReleased
  }

  /** 当前按下的所有指针：id → 位置（设计坐标）。 */
  get pressedPointers(): ReadonlyMap<number, Vector2> {
    return this.#pointers
  }

  // ---------------------------------------------------------------- 内部

  /** @internal 平台事件入队。 */
  _enqueue(event: RawInputEvent): void {
    this.#queue.push(event)
  }

  /** @internal 每帧开始时由 SceneTree 调用：清掉上一帧的 just 状态，按顺序处理队列。 */
  _flush(): void {
    this.#actionJustPressed.clear()
    this.#actionJustReleased.clear()
    this.#pointerJustPressed = false
    this.#pointerJustReleased = false
    const queue = this.#queue
    this.#queue = []
    for (const e of queue) {
      this.#handle(e)
      this.#updateActions()
    }
  }

  #handle(e: RawInputEvent): void {
    if ('code' in e) {
      if (e.type === 'keydown') this.#keysDown.add(e.code)
      else this.#keysDown.delete(e.code)
      return
    }

    const position = this.#viewport.screenToDesign(new Vector2(e.x, e.y))
    this.#pointerPosition = position
    const id = e.pointerId

    if (e.type === 'pointerdown') {
      this.#pointers.set(id, position)
      this.#pointerJustPressed = true
      const node = this.#pick(position)
      if (node) {
        this.#captures.set(id, { node })
        node.pointerDown.emit(event(id, position, node))
      } else {
        this.#unhandledPointers.add(id)
      }
      return
    }

    if (!this.#pointers.has(id) && e.type !== 'pointermove') return
    const capture = this.#captures.get(id)
    const target = capture && capture.node.isInsideTree && !capture.node.isFreed ? capture.node : null

    if (e.type === 'pointermove') {
      if (this.#pointers.has(id)) this.#pointers.set(id, position)
      target?.pointerMove.emit(event(id, position, target))
      return
    }

    // pointerup / pointercancel
    this.#pointers.delete(id)
    this.#unhandledPointers.delete(id)
    this.#captures.delete(id)
    this.#pointerJustReleased = true
    if (target) {
      const ev = event(id, position, target)
      target.pointerUp.emit(ev)
      if (e.type === 'pointerup' && target.hitTest(ev.localPosition)) target.clicked.emit(ev)
    }
  }

  #updateActions(): void {
    for (const [name, bindings] of this.#actions) {
      const pressed = bindings.some((b) => (b.type === 'key' ? this.#keysDown.has(b.code) : this.#unhandledPointers.size > 0))
      const was = this.#actionPressed.has(name)
      if (pressed && !was) {
        this.#actionPressed.add(name)
        this.#actionJustPressed.add(name)
      } else if (!pressed && was) {
        this.#actionPressed.delete(name)
        this.#actionJustReleased.add(name)
      }
    }
  }

  /** 绘制顺序最上层、可点击且命中的节点。 */
  #pick(position: Vector2): Node2D | null {
    const order: Node2D[] = []
    collectDrawOrder(this.#topLevel(), order)
    for (let i = order.length - 1; i >= 0; i--) {
      const n = order[i]!
      if (!n.inputPickable || n.isQueuedForDeletion || !n.isVisibleInTree || !n.canProcess()) continue
      if (n.hitTest(n.toLocal(position))) return n
    }
    return null
  }

  #assertAction(name: string): void {
    if (!this.#actions.has(name)) {
      const known = [...this.#actions.keys()]
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
