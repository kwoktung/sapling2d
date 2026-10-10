import { Vector2 } from '../math/Vector2'
import type { ActionName } from './actions'
import { ActionMap, type ActionSource, type InputBinding } from './input/ActionMap'
import type { RawInputEvent } from './input/events'
import { PointerRouter } from './input/PointerRouter'
import { VirtualControls, type VirtualButton, type VirtualStick } from './input/VirtualControls'
import type { Node } from './Node'
import type { Viewport } from './Viewport'

export type { InputBinding } from './input/ActionMap'
export type { RawInputEvent } from './input/events'

/** 键盘按键绑定。`code` 是 KeyboardEvent.code，如 'Space'、'KeyA'、'ArrowLeft'。 */
export function key(code: string): InputBinding {
  return { type: 'key', code }
}

/** 指针按下绑定：屏幕上任意位置的按下（被 inputPickable 节点处理掉的不算）。 */
export function pointerPress(): InputBinding {
  return { type: 'pointer' }
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
 *
 * 内部由几部分组成：`ActionMap`（动作状态）、`PointerRouter`（指针分发给节点）、`VirtualControls`（屏幕按钮和摇杆）。
 * 这里持有事件队列和键盘状态，把按键、指针、控件汇总成动作的力度。
 */
export class Input {
  private _queue: RawInputEvent[] = []
  private readonly _keysDown = new Set<string>()
  private readonly _actions = new ActionMap()
  private readonly _controls = new VirtualControls()
  private readonly _pointer: PointerRouter
  /** 给 `ActionMap` 的力度来源（构造时建一次）。 */
  private readonly _source: ActionSource = { strength: (action, bindings) => this._strength(action, bindings) }

  /** @internal */
  constructor(viewport: Viewport, topLevel: () => readonly Node[]) {
    this._pointer = new PointerRouter(viewport, topLevel, this._controls)
  }

  // ---------------------------------------------------------------- 动作

  /** 定义（或覆盖）一个动作。也可以在启动参数 `actions` 里一次性定义。 */
  addAction(name: ActionName, bindings: InputBinding[]): void {
    this._actions.add(name, bindings)
  }

  removeAction(name: ActionName): void {
    this._actions.remove(name)
  }

  hasAction(name: ActionName): boolean {
    return this._actions.has(name)
  }

  /** 动作当前是否处于按下状态：任意一个绑定按下，或者力度 ≥ 0.5（摇杆推过一半）。 */
  isActionPressed(name: ActionName): boolean {
    return this._actions.isPressed(name)
  }

  /** 动作是否在本帧刚被按下（在 `physicsProcess` 里：是否在上一个物理步之后刚被按下）。 */
  isActionJustPressed(name: ActionName): boolean {
    return this._actions.isJustPressed(name)
  }

  /** 动作是否在本帧刚被松开（在 `physicsProcess` 里：是否在上一个物理步之后刚被松开）。 */
  isActionJustReleased(name: ActionName): boolean {
    return this._actions.isJustReleased(name)
  }

  /**
   * 动作的力度，0–1：按键、`pointerPress()`、屏幕按钮按下时是 1；摇杆按推动的程度给出 0–1（已经扣掉死区）。
   * 几个来源同时作用时取最大的。力度 ≥ 0.5 时动作算按下（`isActionPressed`）。
   */
  getActionStrength(name: ActionName): number {
    return this._actions.strength(name)
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

  /** @internal 物理步开始时由 SceneTree 调用：物理步期间（physicsProcess 和刚体的接触信号）刚按下 / 刚松开按物理步算。 */
  _beginPhysicsStep(): void {
    this._actions.beginPhysicsStep()
  }

  /** @internal 每个物理步结束时由 SceneTree 调用。 */
  _endPhysicsStep(): void {
    this._actions.endPhysicsStep()
  }

  /** 动作 `action` 当前的力度：屏幕按钮、绑定的按键和指针、摇杆里最大的。 */
  private _strength(action: string, bindings: readonly InputBinding[]): number {
    let strength = this._controls.buttonCount(action) > 0 ? 1 : 0
    for (let i = 0; strength < 1 && i < bindings.length; i++) {
      const b = bindings[i]!
      if (b.type === 'key' ? this._keysDown.has(b.code) : this._pointer.hasUnhandled) strength = 1
    }
    return strength < 1 ? this._controls.stickStrength(action, strength) : strength
  }

  // ---------------------------------------------------------------- 原始状态

  /** 键盘按键是否按下（只有浏览器平台有键盘）。 */
  isKeyPressed(code: string): boolean {
    return this._keysDown.has(code)
  }

  /** 最近一次指针事件的位置（世界坐标，没有相机时就是设计坐标）；还没有任何指针事件时为 null。 */
  get pointerPosition(): Vector2 | null {
    return this._pointer.position
  }

  /** 是否有指针处于按下状态。 */
  get isPointerPressed(): boolean {
    return this._pointer.pointers.size > 0
  }

  /** 本帧是否有指针按下。 */
  get isPointerJustPressed(): boolean {
    return this._pointer.justPressed
  }

  /** 本帧是否有指针抬起。 */
  get isPointerJustReleased(): boolean {
    return this._pointer.justReleased
  }

  /** 当前按下的所有指针：id → 位置（世界坐标，没有相机时就是设计坐标）。 */
  get pressedPointers(): ReadonlyMap<number, Vector2> {
    return this._pointer.pointers
  }

  // ---------------------------------------------------------------- 内部

  /** @internal 平台事件入队。 */
  _enqueue(event: RawInputEvent): void {
    this._queue.push(event)
  }

  /** @internal 每帧开始时由 SceneTree 调用：清掉上一帧的 just 状态，按顺序处理队列。 */
  _flush(): void {
    this._actions.beginFrame()
    this._pointer.beginFrame()
    // 按着的按钮变得不能按（隐藏、暂停、被移除）时松开；动作状态在这里统一更新，所有节点在同一帧看到变化
    this._controls.releaseUnusable()
    this._actions.update(this._source)
    const queue = this._queue
    this._queue = []
    for (const e of queue) {
      if ('code' in e) {
        if (e.type === 'keydown') this._keysDown.add(e.code)
        else this._keysDown.delete(e.code)
      } else {
        this._pointer.handle(e)
      }
      this._actions.update(this._source)
    }
  }

  /**
   * @internal 游戏切到后台：松开所有按下的指针和按键（排队成取消 / 松开事件，下一帧开始时按顺序处理）。
   * 还在队列里、没处理的按下也算：它们的抬起在后台收不到。
   */
  _releaseAll(): void {
    const keys = new Set(this._keysDown)
    for (const e of this._queue) if (e.type === 'keydown') keys.add(e.code)
    this._pointer.releaseAll(this._queue)
    for (const code of keys) this._queue.push({ type: 'keyup', code })
  }

  // ---------------------------------------------------------------- 屏幕控件（由节点进出树时调用）

  /** @internal TouchScreenButton 进入树时调用。 */
  _addButton(button: VirtualButton): void {
    this._controls.addButton(button)
  }

  /** @internal TouchScreenButton 离开树时调用。 */
  _removeButton(button: VirtualButton): void {
    this._controls.removeButton(button)
  }

  /** @internal TouchJoystick 进入树时调用。 */
  _addStick(stick: VirtualStick): void {
    this._controls.addStick(stick)
  }

  /** @internal TouchJoystick 离开树时调用。 */
  _removeStick(stick: VirtualStick): void {
    this._controls.removeStick(stick)
  }
}
