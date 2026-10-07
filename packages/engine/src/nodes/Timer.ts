import { Node, type NodeOptions } from '../core/Node'
import { Signal } from '../core/Signal'

export interface TimerOptions extends NodeOptions {
  /** 计时时长（秒），默认 1。 */
  waitTime?: number
  /** 只触发一次，默认 false（循环触发）。 */
  oneShot?: boolean
  /** 进入树时自动开始，默认 false。 */
  autostart?: boolean
}

/**
 * 计时器节点：倒计时结束时触发 `timeout`。由帧循环驱动，无头测试里随 `step()` 推进。
 *
 * ```ts
 * const spawn = this.add(new Timer({ waitTime: 2, autostart: true }))
 * spawn.timeout.connect(() => this.spawnEnemy(), this)
 *
 * await this.tree.createTimer(0.5).timeout // 一次性的等待，不需要节点
 * ```
 *
 * 每帧最多触发一次；循环模式下超出的时间会计入下一轮，所以长期来看不会漂移。
 */
export class Timer extends Node {
  readonly timeout = new Signal()
  waitTime: number
  oneShot: boolean
  autostart: boolean
  #timeLeft = 0
  #running = false
  #autostarted = false

  constructor(options: TimerOptions = {}) {
    super(options)
    this.waitTime = options.waitTime ?? 1
    this.oneShot = options.oneShot ?? false
    this.autostart = options.autostart ?? false
  }

  /** 剩余时间（秒）；停止时为 0。 */
  get timeLeft(): number {
    return this.#running ? Math.max(0, this.#timeLeft) : 0
  }

  get isStopped(): boolean {
    return !this.#running
  }

  /** 开始（或重新开始）计时。传入 `time` 时同时修改 waitTime。 */
  start(time?: number): void {
    if (time !== undefined) this.waitTime = time
    if (!(this.waitTime > 0)) throw new Error(`Timer waitTime must be > 0, got ${this.waitTime}`)
    this.#timeLeft = this.waitTime
    this.#running = true
  }

  stop(): void {
    this.#running = false
    this.#timeLeft = 0
  }

  /** @internal */
  override _onEnterTree(): void {
    if (this.autostart && !this.#autostarted) {
      this.#autostarted = true
      this.start()
    }
  }

  /** @internal 计时放在引擎内部钩子里：子类覆写 process() 不会影响计时。 */
  override _internalProcess(dt: number): void {
    if (!this.#running) return
    this.#timeLeft -= dt
    if (this.#timeLeft > 1e-9) return
    if (this.oneShot) {
      this.#running = false
      this.#timeLeft = 0
    } else {
      this.#timeLeft += this.waitTime
    }
    this.timeout.emit()
  }

  protected override dumpProps(): Record<string, unknown> {
    return {
      waitTime: this.waitTime,
      oneShot: this.oneShot || undefined,
      timeLeft: this.#running ? Math.round(this.timeLeft * 1000) / 1000 : undefined,
      stopped: this.#running ? undefined : true,
    }
  }
}

/**
 * 一次性计时器（对应 Godot 的 SceneTreeTimer），由 `tree.createTimer(seconds)` 创建，不需要节点。
 * 常用写法：`await this.tree.createTimer(1).timeout`。
 */
export class SceneTreeTimer {
  readonly timeout = new Signal()
  /** 暂停时是否继续计时。 */
  readonly processAlways: boolean
  #timeLeft: number

  /** @internal */
  constructor(seconds: number, processAlways: boolean) {
    this.#timeLeft = seconds
    this.processAlways = processAlways
  }

  get timeLeft(): number {
    return Math.max(0, this.#timeLeft)
  }

  /** @internal 返回 false 表示已触发，可以移除。 */
  _advance(dt: number, paused: boolean): boolean {
    if (paused && !this.processAlways) return true
    this.#timeLeft -= dt
    if (this.#timeLeft > 1e-9) return true
    this.timeout.emit()
    return false
  }
}
