import { Vector2 } from '../math/Vector2'
import type { GroupName } from './groups'
import type { SceneTree } from './SceneTree'
import { Signal, type ConnectionOwner } from './Signal'
import { Tween } from './Tween'

/**
 * 暂停时的处理方式（对应 Godot 的 process_mode）：
 * - `inherit`（默认）：跟随父节点；根上是 `pausable`
 * - `pausable`：`tree.paused` 为 true 时停止（process、physicsProcess、绑定的 Tween / Timer、指针事件）
 * - `always`：暂停时也照常运行，用于暂停菜单
 */
export type ProcessMode = 'inherit' | 'pausable' | 'always'

export interface NodeOptions {
  /** 节点名。默认是类名；同一父节点下重名时自动加数字后缀（Fruit、Fruit2、Fruit3……）。 */
  name?: string
  /** 初始分组，等同于构造后调用 `addToGroup`。 */
  groups?: GroupName[]
  /** 暂停时的处理方式，默认 'inherit'。 */
  processMode?: ProcessMode
}

/** dump 输出里的一个节点。 */
export interface DumpNode {
  type: string
  name: string
  props: Record<string, unknown>
  children: DumpNode[]
}

/**
 * 场景树中的基本单元。游戏对象都通过继承 Node 来扩展，覆写生命周期方法：
 *
 * - `enterTree()`：节点进入树时调用，父节点先于子节点
 * - `ready()`：节点和它的所有子节点都进入树之后调用，子节点先于父节点；每个节点一生只调用一次
 * - `process(dt)`：每个渲染帧调用一次，dt 是秒
 * - `physicsProcess(dt)`：固定 60Hz 调用，dt 恒为 1/60 秒
 * - `exitTree()`：节点离开树时调用，子节点先于父节点
 *
 * 节点之间用类型化字段、Groups 和 Autoload 互相引用，不支持按路径查找（见 ADR 0003）。
 * 销毁节点用 `queueFree()`，在当前帧末尾统一执行。
 */
export class Node implements ConnectionOwner {
  #name: string
  #parent: Node | null = null
  #children: Node[] = []
  #tree: SceneTree | null = null
  #isReady = false
  #queuedForDeletion = false
  #freed = false
  #groups = new Set<string>()
  #connections: { signal: Signal<any>; listener: (...args: any[]) => void }[] = []
  /** 暂停时的处理方式，见 ProcessMode。 */
  processMode: ProcessMode

  constructor(options: NodeOptions = {}) {
    this.#name = options.name ?? this.constructor.name
    this.processMode = options.processMode ?? 'inherit'
    for (const g of options.groups ?? []) this.#groups.add(g)
  }

  // ---------------------------------------------------------------- 生命周期（供子类覆写）

  enterTree(): void {}
  ready(): void {}
  process(_dt: number): void {}
  physicsProcess(_dt: number): void {}
  exitTree(): void {}

  // ---------------------------------------------------------------- 树结构

  get name(): string {
    return this.#name
  }

  set name(value: string) {
    this.#name = this.#parent ? this.#parent.#uniqueChildName(value, this) : value
  }

  get parent(): Node | null {
    return this.#parent
  }

  get children(): readonly Node[] {
    return this.#children
  }

  /** 节点是否在场景树里。 */
  get isInsideTree(): boolean {
    return this.#tree !== null
  }

  /** `ready()` 是否已经调用过。 */
  get isReady(): boolean {
    return this.#isReady
  }

  /**
   * 节点所在的 SceneTree。节点不在树里时访问会抛错——通常意味着在构造函数里就用了 tree，
   * 应该挪到 `enterTree()` 或 `ready()` 里。
   */
  get tree(): SceneTree {
    if (!this.#tree) {
      throw new Error(`Node "${this.#name}" (${this.constructor.name}) is not inside the scene tree yet. Use the tree in enterTree() or ready(), not in the constructor.`)
    }
    return this.#tree
  }

  /**
   * 添加子节点并返回它本身（类型不变），方便写 `this.player = this.add(new Player())`。
   * 如果当前节点已在树里，子节点会立刻依次收到 `enterTree` 和 `ready`。
   */
  add<T extends Node>(child: T): T {
    this.#assertNotFreed('add a child to')
    child.#assertNotFreed('add')
    if (child.#parent) {
      throw new Error(`Cannot add "${child.#name}" to "${this.#name}": it already has a parent "${child.#parent.#name}". Remove it first.`)
    }
    for (let n: Node | null = this; n; n = n.#parent) {
      if (n === child) throw new Error(`Cannot add "${child.#name}" to "${this.#name}": a node cannot be its own ancestor.`)
    }
    child.#name = this.#uniqueChildName(child.#name, child)
    child.#parent = this
    this.#children.push(child)
    if (this.#tree) {
      child.#propagateEnterTree(this.#tree)
      child.#propagateReady()
    }
    return child
  }

  /**
   * 把子节点从树上摘下来（不销毁）。子节点及其后代会收到 `exitTree`，之后可以再加到别处；
   * 重新进入树时不会再调用 `ready()`。要销毁节点请用 `queueFree()`。
   */
  remove(child: Node): void {
    const index = this.#children.indexOf(child)
    if (index === -1) throw new Error(`"${child.#name}" is not a child of "${this.#name}".`)
    if (child.#tree) child.#propagateExitTree()
    this.#children.splice(index, 1)
    child.#parent = null
  }

  #uniqueChildName(base: string, self: Node): string {
    const taken = (name: string) => this.#children.some((c) => c !== self && c.#name === name)
    if (!taken(base)) return base
    const stem = base.replace(/\d+$/, '')
    for (let i = 2; ; i++) if (!taken(`${stem}${i}`)) return `${stem}${i}`
  }

  // ---------------------------------------------------------------- 暂停

  /** 沿祖先链解析出的实际处理方式（'pausable' 或 'always'）。 */
  get effectiveProcessMode(): 'pausable' | 'always' {
    for (let n: Node | null = this; n; n = n.#parent) {
      if (n.processMode !== 'inherit') return n.processMode
    }
    return 'pausable'
  }

  /** 当前是否会被处理：在树里，且树没有暂停或本节点是 always。 */
  canProcess(): boolean {
    if (!this.#tree) return false
    return !this.#tree.paused || this.effectiveProcessMode === 'always'
  }

  // ---------------------------------------------------------------- 销毁与延迟调用

  /** 已经调用过 `queueFree()`、等待帧末销毁。 */
  get isQueuedForDeletion(): boolean {
    return this.#queuedForDeletion
  }

  /** 已经被销毁。销毁后的节点不能再使用。 */
  get isFreed(): boolean {
    return this.#freed
  }

  /**
   * 在当前帧末尾销毁节点和它的所有后代：先离开树（收到 exitTree），再断开信号。
   * 同一帧内重复调用是安全的。不在树里的节点会立即销毁。
   */
  queueFree(): void {
    if (this.#freed || this.#queuedForDeletion) return
    if (this.#tree) {
      this.#queuedForDeletion = true
      this.#tree._queueFree(this)
    } else {
      this._free()
    }
  }

  /**
   * 在当前帧末尾调用 `fn`（在所有 process 之后、销毁节点之前）。
   * 如果到那时节点已被销毁，则不调用。
   */
  callDeferred(fn: () => void): void {
    this.tree.callDeferred(() => {
      if (!this.#freed) fn()
    })
  }

  /** @internal 立即销毁。游戏代码请使用 queueFree()。 */
  _free(): void {
    if (this.#freed) return
    if (this.#parent) this.#parent.remove(this)
    else if (this.#tree) this.#propagateExitTree()
    this.#markFreed()
  }

  #markFreed(): void {
    for (const child of this.#children) child.#markFreed()
    this.#freed = true
    this.#queuedForDeletion = false
    // 断开自己作为监听方的连接（disconnect 会回调 _untrackConnection，所以先取快照）
    for (const { signal, listener } of [...this.#connections]) signal.disconnect(listener)
    this.#connections = []
    // 断开自己声明的信号上的所有监听
    for (const value of Object.values(this)) if (value instanceof Signal) value.disconnectAll()
    this.#groups.clear()
    this._onFreed()
  }

  /** @internal 销毁时对每个节点（含后代）调用一次，供引擎内的子类清理私有资源。 */
  _onFreed(): void {}

  /**
   * @internal 引擎内部的进入/离开树钩子：在用户的 enterTree() 之前、exitTree() 之后调用。
   * 引擎节点（物理刚体等）在这里注册和注销，这样用户覆写 enterTree / exitTree 时不必调用 super。
   */
  _onEnterTree(): void {}

  /** @internal 见 _onEnterTree。 */
  _onExitTree(): void {}

  /** @internal 引擎内部的每帧钩子，在用户的 process() 之前调用（Timer 用它计时）。 */
  _internalProcess(_dt: number): void {}

  // ---------------------------------------------------------------- 补间

  /**
   * 创建一个绑定到本节点的补间动画，下一帧开始播放；本节点被销毁时自动停止。
   *
   * ```ts
   * this.createTween().to(this, { scale: v(1.2, 1.2) }, 0.15, Ease.BackOut).to(this, { scale: v(1, 1) }, 0.1)
   * ```
   */
  createTween(): Tween {
    return this.tree._addTween(new Tween(this))
  }

  /** @internal */
  _trackConnection(signal: Signal<any>, listener: (...args: any[]) => void): void {
    this.#assertNotFreed('connect a signal to')
    this.#connections.push({ signal, listener })
  }

  /** @internal 连接已断开（或 once 已触发）：不再记住它，避免常驻节点的连接列表无限增长。 */
  _untrackConnection(signal: Signal<any>, listener: (...args: any[]) => void): void {
    const i = this.#connections.findIndex((c) => c.signal === signal && c.listener === listener)
    if (i !== -1) this.#connections.splice(i, 1)
  }

  /** @internal 测试用：以本节点为 owner 的连接数。 */
  get _connectionCount(): number {
    return this.#connections.length
  }

  #assertNotFreed(action: string): void {
    if (this.#freed) throw new Error(`Cannot ${action} "${this.#name}" (${this.constructor.name}): the node has been freed.`)
  }

  // ---------------------------------------------------------------- 分组

  /** 节点所属的分组。 */
  get groups(): readonly string[] {
    return [...this.#groups]
  }

  /** 加入分组，之后可以用 `tree.getNodesInGroup(name)` 查到它。组名可以通过 GroupRegistry 声明强类型。 */
  addToGroup(group: GroupName): void {
    this.#groups.add(group)
  }

  removeFromGroup(group: GroupName): void {
    this.#groups.delete(group)
  }

  isInGroup(group: GroupName): boolean {
    return this.#groups.has(group)
  }

  // ---------------------------------------------------------------- 内部：由 SceneTree 驱动

  /** @internal */
  _attachAsRoot(tree: SceneTree): void {
    this.#propagateEnterTree(tree)
    this.#propagateReady()
  }

  #propagateEnterTree(tree: SceneTree): void {
    this.#tree = tree
    this._onEnterTree()
    this.enterTree()
    for (const child of [...this.#children]) {
      // 在 enterTree() 里 add 的子节点已经由 add() 送进树了，这里跳过
      if (child.#parent === this && child.#tree !== tree) child.#propagateEnterTree(tree)
    }
  }

  #propagateReady(): void {
    for (const child of [...this.#children]) {
      if (child.#parent === this && child.#tree) child.#propagateReady()
    }
    if (!this.#isReady && this.#tree) {
      this.#isReady = true
      this.ready()
    }
  }

  #propagateExitTree(): void {
    for (const child of [...this.#children]) child.#propagateExitTree()
    this.exitTree()
    this._onExitTree()
    this.#tree = null
  }

  /** @internal 先序遍历（父先于子）。 */
  _collect(out: Node[]): void {
    out.push(this)
    for (const child of this.#children) child._collect(out)
  }

  // ---------------------------------------------------------------- 调试

  /** 子类覆写来往 dump 里加入关键属性；值为 undefined 的项会被省略，Vector2 会转成 "(x, y)" 字符串。 */
  protected dumpProps(): Record<string, unknown> {
    return {}
  }

  /** @internal */
  _dump(): DumpNode {
    const props: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(this.dumpProps())) {
      if (val !== undefined) props[k] = val instanceof Vector2 ? val.toString() : val
    }
    if (this.#groups.size) props.groups = [...this.#groups]
    if (this.processMode !== 'inherit') props.processMode = this.processMode
    return { type: this.constructor.name, name: this.#name, props, children: this.#children.map((c) => c._dump()) }
  }
}
