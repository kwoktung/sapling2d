/** 能够持有连接的一方（通常是 Node）：释放时会断开它持有的所有连接。 */
export interface ConnectionOwner {
  /** @internal */
  _trackConnection(signal: Signal<any>, listener: (...args: any[]) => void): void
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
  #listeners: { fn: (...args: A) => void; once: boolean }[] = []

  /** 当前连接数。 */
  get connectionCount(): number {
    return this.#listeners.length
  }

  /**
   * 连接监听函数。传入 `owner`（通常是 `this`）时，owner 被释放后连接自动断开。
   * 同一个函数重复连接只算一次。返回一个用于断开的函数。
   */
  connect(listener: (...args: A) => void, owner?: ConnectionOwner): () => void {
    return this.#add(listener, false, owner)
  }

  /** 只触发一次的连接。 */
  once(listener: (...args: A) => void, owner?: ConnectionOwner): () => void {
    return this.#add(listener, true, owner)
  }

  disconnect(listener: (...args: A) => void): void {
    this.#listeners = this.#listeners.filter((l) => l.fn !== listener)
  }

  isConnected(listener: (...args: A) => void): boolean {
    return this.#listeners.some((l) => l.fn === listener)
  }

  /** 断开所有监听。 */
  disconnectAll(): void {
    this.#listeners = []
  }

  /** 依次调用监听函数。emit 过程中新增或断开的连接不影响本次调用。 */
  emit(...args: A): void {
    const snapshot = this.#listeners
    this.#listeners = snapshot.filter((l) => !l.once)
    for (const l of snapshot) {
      if (l.once || this.#listeners.includes(l)) l.fn(...args)
    }
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

  #add(fn: (...args: A) => void, once: boolean, owner?: ConnectionOwner): () => void {
    if (!this.isConnected(fn)) {
      this.#listeners.push({ fn, once })
      owner?._trackConnection(this, fn as (...args: any[]) => void)
    }
    return () => this.disconnect(fn)
  }
}
