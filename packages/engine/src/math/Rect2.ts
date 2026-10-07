import { fmt, Vector2 } from './Vector2'

/** 不可变的轴对齐矩形（对应 Godot 的 Rect2）。 */
export class Rect2 {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly width: number,
    readonly height: number,
  ) {
    Object.freeze(this)
  }

  get position(): Vector2 {
    return new Vector2(this.x, this.y)
  }

  get size(): Vector2 {
    return new Vector2(this.width, this.height)
  }

  get left(): number {
    return this.x
  }

  get top(): number {
    return this.y
  }

  get right(): number {
    return this.x + this.width
  }

  get bottom(): number {
    return this.y + this.height
  }

  get center(): Vector2 {
    return new Vector2(this.x + this.width / 2, this.y + this.height / 2)
  }

  /** 点是否在矩形内（含左上边界，不含右下边界）。 */
  contains(p: Vector2): boolean {
    return p.x >= this.x && p.y >= this.y && p.x < this.right && p.y < this.bottom
  }

  /** 两个矩形的交集；不相交时宽高为 0。 */
  intersection(o: Rect2): Rect2 {
    const x = Math.max(this.x, o.x)
    const y = Math.max(this.y, o.y)
    return new Rect2(x, y, Math.max(0, Math.min(this.right, o.right) - x), Math.max(0, Math.min(this.bottom, o.bottom) - y))
  }

  isEqualApprox(o: Rect2, epsilon = 1e-6): boolean {
    return [this.x - o.x, this.y - o.y, this.width - o.width, this.height - o.height].every((d) => Math.abs(d) <= epsilon)
  }

  toString(): string {
    return `Rect2(${fmt(this.x)}, ${fmt(this.y)}, ${fmt(this.width)}, ${fmt(this.height)})`
  }
}

/** `new Rect2(x, y, width, height)` 的简写。 */
export function rect(x: number, y: number, width: number, height: number): Rect2 {
  return new Rect2(x, y, width, height)
}
