import { Vector2 } from './Vector2'

/**
 * 不可变的 2D 仿射变换（对应 Godot 的 Transform2D）：
 *
 * ```
 * | a  c  tx |
 * | b  d  ty |
 * ```
 *
 * 点 p 变换为 (a·x + c·y + tx, b·x + d·y + ty)。
 */
export class Transform2D {
  static readonly IDENTITY = new Transform2D(1, 0, 0, 1, 0, 0)

  constructor(
    readonly a: number,
    readonly b: number,
    readonly c: number,
    readonly d: number,
    readonly tx: number,
    readonly ty: number,
  ) {
    Object.freeze(this)
  }

  /** 先缩放、再旋转、再平移（与 Node2D 和 Pixi 的变换顺序一致）。 */
  static fromParts(position: Vector2, rotation: number, scale: Vector2): Transform2D {
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    return new Transform2D(cos * scale.x, sin * scale.x, -sin * scale.y, cos * scale.y, position.x, position.y)
  }

  /** this ∘ other：先应用 other，再应用 this。 */
  multiply(o: Transform2D): Transform2D {
    return new Transform2D(
      this.a * o.a + this.c * o.b,
      this.b * o.a + this.d * o.b,
      this.a * o.c + this.c * o.d,
      this.b * o.c + this.d * o.d,
      this.a * o.tx + this.c * o.ty + this.tx,
      this.b * o.tx + this.d * o.ty + this.ty,
    )
  }

  /** 逆变换；缩放为 0 时不可逆，返回 null。 */
  inverse(): Transform2D | null {
    const det = this.a * this.d - this.b * this.c
    if (det === 0) return null
    return new Transform2D(
      this.d / det,
      -this.b / det,
      -this.c / det,
      this.a / det,
      (this.c * this.ty - this.d * this.tx) / det,
      (this.b * this.tx - this.a * this.ty) / det,
    )
  }

  apply(p: Vector2): Vector2 {
    return new Vector2(this.a * p.x + this.c * p.y + this.tx, this.b * p.x + this.d * p.y + this.ty)
  }

  get origin(): Vector2 {
    return new Vector2(this.tx, this.ty)
  }
}
