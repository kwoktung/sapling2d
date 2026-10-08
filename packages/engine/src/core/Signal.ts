/** 能够持有连接的一方（通常是 Node）：释放时会断开它持有的所有连接。 */
export interface ConnectionOwner {
  /** @internal */
  _trackConnection(signal: Signal<any>, listener: (...args: any[]) => void): void
  /** @internal 连接断开（包括 once 触发后）时调用，owner 不再需要记住它。 */
  _untrackConnection(signal: Signal<any>, listener: (...args: any[]) => void): void
}

interface Listener<A extends unknown[]> {
  fn: (...args: A) => void
  once: boolean
  owner: ConnectionOwner | undefined
  /** 断开后为 false：emit 遍历快照时跳过它，即使它是在本次 emit 中途被断开的。 */
  active: boolean
}

/** `await signal` 得到的值：无参数时是 undefined，一个参数时是该参数，多个参数时是参数数组。 */
export type SignalResult<A extends unknown[]> = A extends [] ? undefined : A extends [infer Only] ? Only : A

/**
 * 强类型信号（对应 Godot 的 signal）。在类里声明为只读字段：
 *
 * ```ts
 * class Enemy extends Node2D {
 *   readonly died = new Signal<[score: number]>()
 * }
 * enemy.died.connect((score) => this.addScore(score), this) // 传 this：this 被释放时自动断开
 * enemy.died.emit(10)
 * const score = await enemy.died // 等待下一次 emit
 * ```
 *
 * 监听函数请用箭头函数，避免丢失 this。
 * 节点被释放时，它声明的信号会断开所有监听；它作为 owner 连接到别处的监听也会被断开。
 */
export class Signal<A extends unknown[] = []> implements PromiseLike<SignalResult<A>> {
  private _listeners: Listener<A>[] = []

  /** 当前连接数。 */
  get connectionCount(): number {
    return this._listeners.length
  }

  /**
   * 连接监听函数。传入 `owner`（通常是 `this`）时，owner 被释放后连接自动断开。
   * 同一个函数重复连接只算一次。返回一个用于断开的函数。
   */
  connect(listener: (...args: A) => void, owner?: ConnectionOwner): () => void {
    return this._add(listener, false, owner)
  }

  /** 只触发一次的连接。 */
  once(listener: (...args: A) => void, owner?: ConnectionOwner): () => void {
    return this._add(listener, true, owner)
  }

  disconnect(listener: (...args: A) => void): void {
    const entry = this._listeners.find((l) => l.fn === listener)
    if (entry) this._remove(entry)
  }

  isConnected(listener: (...args: A) => void): boolean {
    return this._listeners.some((l) => l.fn === listener)
  }

  /** 断开所有监听。 */
  disconnectAll(): void {
    for (const l of [...this._listeners]) this._remove(l)
  }

  /**
   * 依次调用监听函数。emit 过程中新增的连接本次不会被调用；
   * 在本次 emit 中被断开的连接（包括 once 连接、以及 owner 被销毁的连接）也不会再被调用。
   */
  emit(...args: A): void {
    for (const l of [...this._listeners]) {
      if (!l.active) continue
      if (l.once) this._remove(l) // 先移除：回调里再次 emit 也不会重复触发
      l.fn(...args)
    }
  }

  private _remove(entry: Listener<A>): void {
    if (!entry.active) return
    entry.active = false
    this._listeners = this._listeners.filter((l) => l !== entry)
    entry.owner?._untrackConnection(this, entry.fn as (...args: any[]) => void)
  }

  /**
   * 返回一个在下一次 emit 时 resolve 的 Promise。监听在调用 wait() 时**立即**注册，
   * 所以 `const p = s.wait(); s.emit()` 能拿到这次触发。
   */
  wait(): Promise<SignalResult<A>> {
    return new Promise((resolve) => {
      this.once((...args: A) => resolve((args.length === 0 ? undefined : args.length === 1 ? args[0] : args) as SignalResult<A>))
    })
  }

  /**
   * 让信号可以被 await：等待下一次 emit。
   *
   * 注意：JS 会在一个微任务之后才调用 then()，所以 `await s` 之前同步发生的 emit 会被错过。
   * 游戏里 emit 通常发生在之后的帧，不受影响；需要先注册再触发时用 `s.wait()`。
   */
  then<R1 = SignalResult<A>, R2 = never>(
    onfulfilled?: ((value: SignalResult<A>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.wait().then(onfulfilled, onrejected)
  }

  private _add(fn: (...args: A) => void, once: boolean, owner?: ConnectionOwner): () => void {
    if (!this.isConnected(fn)) {
      this._listeners.push({ fn, once, owner, active: true })
      owner?._trackConnection(this, fn as (...args: any[]) => void)
    }
    return () => this.disconnect(fn)
  }
}
