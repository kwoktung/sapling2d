import { Ease, type EaseFn } from '../math/ease'
import { Vector2 } from '../math/Vector2'
import type { Node } from './Node'
import type { Node2D } from './Node2D'
import { Signal } from './Signal'

/** 对象上可以补间的属性名：值是 number 或 Vector2 的属性。 */
export type TweenableKey<T> = { [K in keyof T]-?: T[K] extends number | Vector2 ? K : never }[keyof T] & string

/** `to()` 的目标值：只允许可补间的属性，类型与属性一致。 */
export type TweenProps<T> = { [K in TweenableKey<T>]?: T[K] }

/** 一个补间动作：start 在所在的步骤开始时调用（此时读取起始值），update 收到 0–1 的进度。 */
interface Tweener {
  duration: number
  start(): void
  update(progress: number): void
}

/**
 * 补间动画。用 `this.createTween()` 创建（绑定到节点：节点销毁时自动停止），下一帧开始播放。
 *
 * ```ts
 * const tween = this.createTween()
 *   .to(fruit, { scale: v(1.2, 1.2) }, 0.15, Ease.BackOut)
 *   .to(fruit, { scale: v(1, 1) }, 0.1)
 *   .call(() => fruit.queueFree())
 * await tween.finished
 * ```
 *
 * 默认按顺序执行；在某个动作前调用 `parallel()`，它会和前一个动作同时进行。
 * 和 Godot 一样，每一步的起始值在这一步开始时才读取。
 */
export class Tween {
  /** 所有步骤播放完毕时触发。被 kill（包括绑定节点被销毁）时不触发。 */
  readonly finished = new Signal()
  /** 步骤列表：每个步骤是一组同时进行的动作。 */
  #steps: Tweener[][] = []
  #nextParallel = false
  #stepIndex = 0
  #stepTime = 0
  #stepStarted = false
  #running = true
  readonly #bound: Node | null

  /** @internal 请用 node.createTween() 或 tree.createTween()。 */
  constructor(bound: Node | null) {
    this.#bound = bound
  }

  /** 是否还在播放（未结束、未被 kill）。 */
  get isRunning(): boolean {
    return this.#running
  }

  /**
   * 在 `duration` 秒内把 target 的属性补间到目标值。支持 number 和 Vector2 属性。
   * `ease` 默认线性。
   */
  to<T extends object>(target: T, props: TweenProps<T>, duration: number, ease?: EaseFn): this
  /**
   * 在类的方法里写 `to(this, {...})` 时，TypeScript 无法展开多态 this 的属性类型，会落到这个重载：
   * 按 Node2D 的属性检查（position、x、y、rotation、scale 等）。补间子类特有的属性请写 `to(this as MyNode, ...)`。
   */
  to(target: Node2D, props: TweenProps<Node2D>, duration: number, ease?: EaseFn): this
  to<T extends object>(target: T, props: TweenProps<T>, duration: number, ease: EaseFn = Ease.Linear): this {
    const keys = Object.keys(props) as TweenableKey<T>[]
    for (const [i, key] of keys.entries()) {
      if (i > 0) this.#nextParallel = true // 同一个 to() 里的多个属性同时进行
      const end = props[key] as unknown as number | Vector2
      let start: number | Vector2 = 0
      const obj = target as Record<string, unknown>
      this.#add({
        duration: Math.max(0, duration),
        start: () => {
          const current = obj[key]
          if (typeof current !== 'number' && !(current instanceof Vector2)) {
            throw new Error(`Tween: property "${key}" of ${target.constructor.name} is not a number or Vector2`)
          }
          start = current
        },
        update: (p) => {
          if (isTargetGone(target)) return
          const k = ease(p)
          obj[key] = typeof start === 'number' ? start + ((end as number) - start) * k : start.lerp(end as Vector2, k)
        },
      })
    }
    return this
  }

  /** 等待一段时间（秒）。 */
  wait(seconds: number): this {
    this.#add({ duration: Math.max(0, seconds), start: () => {}, update: () => {} })
    return this
  }

  /** 调用一个函数（不占时间）。 */
  call(fn: () => void): this {
    let called = false
    this.#add({
      duration: 0,
      start: () => (called = false),
      update: () => {
        if (!called) {
          called = true
          fn()
        }
      },
    })
    return this
  }

  /** 让下一个动作（to / wait / call）与前一个动作同时进行。 */
  parallel(): this {
    this.#nextParallel = true
    return this
  }

  /** 立即停止，不触发 finished。 */
  kill(): void {
    this.#running = false
  }

  #add(t: Tweener): void {
    const last = this.#steps[this.#steps.length - 1]
    if (this.#nextParallel && last) last.push(t)
    else this.#steps.push([t])
    this.#nextParallel = false
  }

  /** @internal 由 SceneTree 每帧调用；返回 false 表示已结束，可以移除。`paused` 是树的暂停状态（未绑定节点的 Tween 跟随它）。 */
  _advance(dt: number, paused: boolean): boolean {
    if (!this.#running) return false
    if (this.#bound && (this.#bound.isFreed || this.#bound.isQueuedForDeletion)) {
      this.#running = false
      return false
    }
    if (this.#bound ? !this.#bound.canProcess() : paused) return true // 暂停：保留，下一帧再推进
    let remaining = dt
    while (this.#stepIndex < this.#steps.length) {
      const step = this.#steps[this.#stepIndex]!
      if (!this.#stepStarted) {
        for (const t of step) t.start()
        this.#stepStarted = true
        this.#stepTime = 0
      }
      const duration = Math.max(...step.map((t) => t.duration))
      this.#stepTime += remaining
      // 容忍浮点累加误差：n 次 1/60 恰好等于 n/60 秒
      const progress = (t: Tweener) => (this.#stepTime >= t.duration - EPSILON ? 1 : this.#stepTime / t.duration)
      for (const t of step) t.update(progress(t))
      if (!this.#running) return false // 回调里 kill 了
      if (this.#stepTime < duration - EPSILON) return true
      // 这一步结束：剩余时间顺延给下一步
      remaining = Math.max(0, this.#stepTime - duration)
      this.#stepIndex++
      this.#stepStarted = false
    }
    this.#running = false
    this.finished.emit()
    return false
  }
}

const EPSILON = 1e-9

/** 目标是节点且已被销毁时，不再写入属性。 */
function isTargetGone(target: object): boolean {
  return 'isFreed' in target && (target as { isFreed: unknown }).isFreed === true
}
