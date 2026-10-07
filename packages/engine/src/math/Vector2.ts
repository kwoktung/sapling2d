/**
 * 不可变的二维向量（见 ADR 0004）。所有运算都返回新实例。
 *
 * 修改节点位置时要重新赋值：`node.position = node.position.add(v(10, 0))`，
 * 或者用 `node.x += 10`。
 */
export class Vector2 {
  static readonly ZERO = new Vector2(0, 0)
  static readonly ONE = new Vector2(1, 1)
  static readonly UP = new Vector2(0, -1)
  static readonly DOWN = new Vector2(0, 1)
  static readonly LEFT = new Vector2(-1, 0)
  static readonly RIGHT = new Vector2(1, 0)

  constructor(
    readonly x: number,
    readonly y: number,
  ) {
    Object.freeze(this)
  }

  /** 由角度（弧度）得到单位向量；0 指向 +x，y 轴向下所以正角度顺时针。 */
  static fromAngle(radians: number): Vector2 {
    return new Vector2(Math.cos(radians), Math.sin(radians))
  }

  add(o: Vector2): Vector2 {
    return new Vector2(this.x + o.x, this.y + o.y)
  }

  sub(o: Vector2): Vector2 {
    return new Vector2(this.x - o.x, this.y - o.y)
  }

  /** 乘以标量；传入向量时按分量相乘。 */
  mul(s: number | Vector2): Vector2 {
    return typeof s === 'number' ? new Vector2(this.x * s, this.y * s) : new Vector2(this.x * s.x, this.y * s.y)
  }

  div(s: number | Vector2): Vector2 {
    return typeof s === 'number' ? new Vector2(this.x / s, this.y / s) : new Vector2(this.x / s.x, this.y / s.y)
  }

  neg(): Vector2 {
    return new Vector2(-this.x, -this.y)
  }

  dot(o: Vector2): number {
    return this.x * o.x + this.y * o.y
  }

  /** 二维叉积（z 分量）。 */
  cross(o: Vector2): number {
    return this.x * o.y - this.y * o.x
  }

  length(): number {
    return Math.hypot(this.x, this.y)
  }

  lengthSquared(): number {
    return this.x * this.x + this.y * this.y
  }

  /** 单位向量；零向量返回零向量。 */
  normalized(): Vector2 {
    const len = this.length()
    return len === 0 ? Vector2.ZERO : new Vector2(this.x / len, this.y / len)
  }

  distanceTo(o: Vector2): number {
    return Math.hypot(this.x - o.x, this.y - o.y)
  }

  /** 向量的角度（弧度）。 */
  angle(): number {
    return Math.atan2(this.y, this.x)
  }

  angleTo(o: Vector2): number {
    return Math.atan2(this.cross(o), this.dot(o))
  }

  rotated(radians: number): Vector2 {
    const c = Math.cos(radians)
    const s = Math.sin(radians)
    return new Vector2(this.x * c - this.y * s, this.x * s + this.y * c)
  }

  lerp(to: Vector2, t: number): Vector2 {
    return new Vector2(this.x + (to.x - this.x) * t, this.y + (to.y - this.y) * t)
  }

  equals(o: Vector2): boolean {
    return this.x === o.x && this.y === o.y
  }

  isEqualApprox(o: Vector2, epsilon = 1e-6): boolean {
    return Math.abs(this.x - o.x) <= epsilon && Math.abs(this.y - o.y) <= epsilon
  }

  toString(): string {
    return `(${fmt(this.x)}, ${fmt(this.y)})`
  }
}

/** `new Vector2(x, y)` 的简写。 */
export function v(x: number, y: number): Vector2 {
  return new Vector2(x, y)
}

/** dump 和 toString 用：最多保留两位小数，去掉多余的 0。 */
export function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return String(Math.round(n * 100) / 100)
}
