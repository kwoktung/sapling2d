/**
 * 带 seed 的伪随机数生成器（mulberry32）。同一个 seed 永远得到同样的序列，
 * 无头测试里的随机行为因此可以复现。游戏代码应使用 `this.tree.rng`，不要用 Math.random。
 */
export class RandomNumberGenerator {
  #state: number
  readonly seed: number

  constructor(seed = Date.now()) {
    this.seed = seed >>> 0
    this.#state = this.seed
  }

  /** [0, 1) 之间的浮点数。 */
  randf(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0
    let t = this.#state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** [from, to) 之间的浮点数。 */
  randfRange(from: number, to: number): number {
    return from + (to - from) * this.randf()
  }

  /** [from, to] 之间的整数，两端都包含。 */
  randiRange(from: number, to: number): number {
    return from + Math.floor(this.randf() * (to - from + 1))
  }

  /** 从数组里随机取一个元素；空数组返回 undefined。 */
  pick<T>(items: readonly T[]): T | undefined {
    return items.length === 0 ? undefined : items[Math.floor(this.randf() * items.length)]
  }
}
