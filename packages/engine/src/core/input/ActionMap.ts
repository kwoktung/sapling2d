/** 动作绑定：键盘按键（KeyboardEvent.code，如 'Space'、'KeyA'、'ArrowLeft'），或任意一次未被节点处理的指针按下。 */
export type InputBinding = { readonly type: 'key'; readonly code: string } | { readonly type: 'pointer' }

/** 动作的力度从哪里来：按键、指针、屏幕按钮、摇杆由 `Input` 汇总。 */
export interface ActionSource {
  /** 动作 `action`（绑定是 `bindings`）当前的力度，0–1。 */
  strength(action: string, bindings: readonly InputBinding[]): number
}

/** 力度达到这个值时动作算按下（和 Godot 动作的默认死区一样）。 */
const PRESS_THRESHOLD = 0.5

/**
 * 动作表和动作状态：每个动作的力度、是否按下、刚按下 / 刚松开（分渲染帧和物理步两套）。
 * 力度由 `ActionSource` 提供，这里只把力度变成按下状态和边沿。
 */
export class ActionMap {
  private readonly _actions = new Map<string, InputBinding[]>()
  private readonly _pressed = new Set<string>()
  private readonly _justPressed = new Set<string>()
  private readonly _justReleased = new Set<string>()
  /** 上一个物理步之后刚按下 / 刚松开的动作：`physicsProcess` 里查询的是它们。 */
  private readonly _physicsJustPressed = new Set<string>()
  private readonly _physicsJustReleased = new Set<string>()
  /** 动作名 → 力度（0–1），每次更新动作状态时算好。 */
  private readonly _strength = new Map<string, number>()
  /** 在物理步期间：刚按下 / 刚松开按物理步算。 */
  private _inPhysics = false

  add(name: string, bindings: InputBinding[]): void {
    this._actions.set(name, [...bindings])
  }

  remove(name: string): void {
    this._actions.delete(name)
    this._pressed.delete(name)
    this._justPressed.delete(name)
    this._justReleased.delete(name)
    this._physicsJustPressed.delete(name)
    this._physicsJustReleased.delete(name)
    this._strength.delete(name)
  }

  has(name: string): boolean {
    return this._actions.has(name)
  }

  isPressed(name: string): boolean {
    this._assert(name)
    return this._pressed.has(name)
  }

  isJustPressed(name: string): boolean {
    this._assert(name)
    return (this._inPhysics ? this._physicsJustPressed : this._justPressed).has(name)
  }

  isJustReleased(name: string): boolean {
    this._assert(name)
    return (this._inPhysics ? this._physicsJustReleased : this._justReleased).has(name)
  }

  strength(name: string): number {
    this._assert(name)
    return this._strength.get(name) ?? 0
  }

  /** 每帧开始时：清掉上一帧的刚按下 / 刚松开。 */
  beginFrame(): void {
    this._justPressed.clear()
    this._justReleased.clear()
  }

  /** 物理步开始（physicsProcess 和刚体的接触信号之前）：之后的刚按下 / 刚松开按物理步算。 */
  beginPhysicsStep(): void {
    this._inPhysics = true
  }

  /** 物理步结束：恢复按渲染帧算，清掉物理步的刚按下 / 刚松开。 */
  endPhysicsStep(): void {
    this._inPhysics = false
    this._physicsJustPressed.clear()
    this._physicsJustReleased.clear()
  }

  /** 重新算所有动作的力度，力度跨过阈值时记下按下 / 松开。 */
  update(source: ActionSource): void {
    for (const [name, bindings] of this._actions) {
      const strength = source.strength(name, bindings)
      this._strength.set(name, strength)
      const pressed = strength >= PRESS_THRESHOLD
      const was = this._pressed.has(name)
      if (pressed && !was) {
        this._pressed.add(name)
        this._justPressed.add(name)
        this._physicsJustPressed.add(name)
      } else if (!pressed && was) {
        this._pressed.delete(name)
        this._justReleased.add(name)
        this._physicsJustReleased.add(name)
      }
    }
  }

  private _assert(name: string): void {
    if (!this._actions.has(name)) {
      const known = [...this._actions.keys()]
      throw new Error(`Unknown input action "${name}". Define it in the game options (actions: { ${name}: [...] }) or with tree.input.addAction(). Known actions: ${known.length ? known.join(', ') : '(none)'}.`)
    }
  }
}
