import type { Vector2 } from '../math/Vector2'

/**
 * 碰撞形状（对应 Godot 的 Shape2D 资源）。尺寸单位是像素，与节点的 scale 无关。
 * 把它交给 CollisionShape2D：`new CollisionShape2D({ shape: circle(30) })`。
 */
export type Shape2D = CircleShape2D | RectangleShape2D | ConvexPolygonShape2D

/** 以原点为圆心的圆。 */
export class CircleShape2D {
  readonly kind = 'circle'
  constructor(readonly radius: number) {
    if (!(radius > 0)) throw new Error(`CircleShape2D radius must be > 0, got ${radius}`)
    Object.freeze(this)
  }

  get area(): number {
    return Math.PI * this.radius * this.radius
  }

  toString(): string {
    return `circle(${this.radius})`
  }
}

/** 以原点为中心的矩形。 */
export class RectangleShape2D {
  readonly kind = 'rectangle'
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    if (!(width > 0 && height > 0)) throw new Error(`RectangleShape2D size must be > 0, got ${width}×${height}`)
    Object.freeze(this)
  }

  get area(): number {
    return this.width * this.height
  }

  toString(): string {
    return `rectangle(${this.width}, ${this.height})`
  }
}

/** `new CircleShape2D(radius)` 的简写。 */
export function circle(radius: number): CircleShape2D {
  return new CircleShape2D(radius)
}

/** `new RectangleShape2D(width, height)` 的简写。 */
export function rectangle(width: number, height: number): RectangleShape2D {
  return new RectangleShape2D(width, height)
}

/** 凸多边形顶点数上限（planck 的 Settings.maxPolygonVertices）。 */
export const MAX_POLYGON_VERTICES = 12

/**
 * 凸多边形，顶点相对原点（像素）。传入的点会取凸包；凹多边形请拆成多个 CollisionShape2D。
 * 顶点数 3–12。
 */
export class ConvexPolygonShape2D {
  readonly kind = 'polygon'
  /** 凸包顶点（逆时针）。 */
  readonly points: readonly Vector2[]
  readonly area: number

  constructor(points: readonly Vector2[]) {
    const hull = convexHull(points)
    if (hull.length < 3) throw new Error(`ConvexPolygonShape2D needs at least 3 non-collinear points, got ${points.length}`)
    if (hull.length > MAX_POLYGON_VERTICES) {
      throw new Error(`ConvexPolygonShape2D supports at most ${MAX_POLYGON_VERTICES} vertices, got ${hull.length}; split it into several shapes`)
    }
    this.points = Object.freeze(hull)
    let a = 0
    for (let i = 0; i < hull.length; i++) {
      const p = hull[i]!
      const q = hull[(i + 1) % hull.length]!
      a += p.x * q.y - q.x * p.y
    }
    this.area = Math.abs(a) / 2
    Object.freeze(this)
  }

  toString(): string {
    return `polygon(${this.points.length} points)`
  }
}

/** `new ConvexPolygonShape2D(points)` 的简写。 */
export function polygon(points: readonly Vector2[]): ConvexPolygonShape2D {
  return new ConvexPolygonShape2D(points)
}

/** Andrew 单调链凸包，返回逆时针顶点，去掉共线点。 */
function convexHull(points: readonly Vector2[]): Vector2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: Vector2, a: Vector2, b: Vector2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const build = (list: Vector2[]) => {
    const out: Vector2[] = []
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }
  if (pts.length < 3) return pts
  return [...build(pts), ...build([...pts].reverse())]
}
