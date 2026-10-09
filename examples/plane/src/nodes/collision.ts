/** 参与圆形碰撞的对象。 */
export interface Circle {
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly dead: boolean
}

/**
 * 两组对象之间的圆形碰撞。按 llms.txt「性能」一节的写法：b 组的位置先读进数组，
 * a 组每个对象的位置只读一次，内层循环只做算术（iOS 小游戏没有 JIT，getter 和分配都贵）。
 */
export class HitTester {
  private _x = new Float64Array(64)
  private _y = new Float64Array(64)
  private _r = new Float64Array(64)

  /** 对每一对相交的 (a, b) 调用 `hit`；返回 true 表示 a 已经用掉了（比如子弹打中了），不再和其他 b 比较。 */
  forEachHit<A extends Circle, B extends Circle>(as: readonly A[], bs: readonly B[], hit: (a: A, b: B) => boolean): void {
    const n = bs.length
    if (n === 0 || as.length === 0) return
    if (this._x.length < n) {
      const size = Math.max(n, this._x.length * 2)
      this._x = new Float64Array(size)
      this._y = new Float64Array(size)
      this._r = new Float64Array(size)
    }
    const bx = this._x
    const by = this._y
    const br = this._r
    for (let j = 0; j < n; j++) {
      const b = bs[j]!
      bx[j] = b.x
      by[j] = b.y
      br[j] = b.dead ? -1e9 : b.radius // 已经死了的 b：半径设成负数，永远不相交
    }
    for (let i = 0; i < as.length; i++) {
      const a = as[i]!
      if (a.dead) continue
      const ax = a.x
      const ay = a.y
      const ar = a.radius
      for (let j = 0; j < n; j++) {
        const dx = ax - bx[j]!
        const dy = ay - by[j]!
        const r = ar + br[j]!
        if (r <= 0 || dx * dx + dy * dy > r * r) continue
        const b = bs[j]!
        if (b.dead) {
          br[j] = -1e9
          continue
        }
        if (hit(a, b)) break
        if (b.dead) br[j] = -1e9
      }
    }
  }
}

/** 原地去掉已经死了的对象（不分配新数组）。 */
export function compact<T extends { dead: boolean }>(list: T[]): void {
  let w = 0
  for (let i = 0; i < list.length; i++) {
    const item = list[i]!
    if (!item.dead) list[w++] = item
  }
  list.length = w
}
