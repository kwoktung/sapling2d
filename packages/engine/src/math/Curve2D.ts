/** `Curve2D` 的控制点：`Vector2`，或任何带 `x` / `y` 的对象（例如 Tiled 对象的 `points`）。 */
export interface CurvePoint {
  readonly x: number
  readonly y: number
}

export interface Curve2DOptions {
  /** 首尾相接（巡逻、绕圈的路线）：最后一个点连回第一个点，按距离取点时超出长度会绕回起点。默认 false。 */
  closed?: boolean
  /** 预先采样成折线时相邻两个点的大约间距（像素），越小越精确。默认 5。 */
  bakeInterval?: number
}

/**
 * 2D 曲线（对应 Godot 的 Curve2D，只保留按距离取点的部分）：怪物的行进路线、导弹的轨迹、巡逻路线。
 * 创建时预先采样成一条密集的折线（“烘焙”），之后按**走过的距离**取点，所以沿曲线匀速移动只要每帧加距离：
 *
 * ```ts
 * const path = Curve2D.catmullRom([v(100, -40), v(500, 300), v(200, 700), v(400, 1200)])
 * const p = { x: 0, y: 0 } // 复用，不分配
 * dist += speed * dt
 * path.sample(dist, p)
 * enemy.x = p.x
 * enemy.y = p.y
 * enemy.rotation = path.angleAt(dist)
 * ```
 *
 * - `catmullRom(points)`：平滑地经过每一个控制点。用的是 centripetal 参数化：普通（uniform）Catmull-Rom 在控制点间距不均时会打结、出尖角。
 * - `polyline(points)`：直线段连起来（拐角是尖的）。
 *
 * 曲线创建后不可变；创建时分配内存，`sample` / `angleAt` / `length` 不分配。
 */
export class Curve2D {
  /** 整条曲线的长度（像素）。 */
  readonly length: number
  readonly closed: boolean
  /** 烘焙出的折线：每个点的坐标和从起点到它的弧长。 */
  private readonly _xs: Float64Array
  private readonly _ys: Float64Array
  private readonly _lens: Float64Array

  private constructor(xs: number[], ys: number[], closed: boolean) {
    const n = xs.length
    this._xs = new Float64Array(xs)
    this._ys = new Float64Array(ys)
    this._lens = new Float64Array(n)
    for (let i = 1; i < n; i++) this._lens[i] = this._lens[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, ys[i]! - ys[i - 1]!)
    this.length = this._lens[n - 1]!
    this.closed = closed
  }

  /** 平滑经过每个控制点的曲线（centripetal Catmull-Rom）。至少 2 个点；相邻的重复点会被去掉。 */
  static catmullRom(points: readonly CurvePoint[], options: Curve2DOptions = {}): Curve2D {
    const closed = options.closed ?? false
    const pts = prepare('catmullRom', points, closed)
    const interval = bakeInterval(options)
    const n = pts.length
    const segments = closed ? n : n - 1
    const xs: number[] = []
    const ys: number[] = []
    const out = { x: 0, y: 0 }
    const at = (i: number): CurvePoint => pts[closed ? (i + n) % n : i]!
    for (let s = 0; s < segments; s++) {
      const p1 = at(s)
      const p2 = at(s + 1)
      // 开放曲线首尾段外侧的控制点：把相邻点镜像过去
      const p0 = closed || s > 0 ? at(s - 1) : { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y }
      const p3 = closed || s + 2 < n ? at(s + 2) : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y }
      // 先粗略估计这一段的弧长，再按间距决定采样数
      let estimate = 0
      let px = p1.x
      let py = p1.y
      for (let k = 1; k <= 8; k++) {
        centripetal(p0, p1, p2, p3, k / 8, out)
        estimate += Math.hypot(out.x - px, out.y - py)
        px = out.x
        py = out.y
      }
      const steps = Math.max(2, Math.ceil(estimate / interval))
      for (let k = 0; k < steps; k++) {
        centripetal(p0, p1, p2, p3, k / steps, out)
        xs.push(out.x)
        ys.push(out.y)
      }
    }
    const end = at(segments)
    xs.push(end.x)
    ys.push(end.y)
    return new Curve2D(xs, ys, closed)
  }

  /** 直线段连接控制点（拐角是尖的）。至少 2 个点；相邻的重复点会被去掉。 */
  static polyline(points: readonly CurvePoint[], options: Pick<Curve2DOptions, 'closed'> = {}): Curve2D {
    const closed = options.closed ?? false
    const pts = prepare('polyline', points, closed)
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    if (closed) {
      xs.push(pts[0]!.x)
      ys.push(pts[0]!.y)
    }
    return new Curve2D(xs, ys, closed)
  }

  /**
   * 从起点沿曲线走 `distance` 像素处的位置，写进 `out` 并返回它（不分配；`out` 每帧复用）。
   * 开放曲线：超出 [0, length] 时停在端点。闭合曲线：绕回起点（负数往回绕）。
   */
  sample<T extends { x: number; y: number }>(distance: number, out: T): T {
    const i = this._segment(distance)
    const t = this._t
    out.x = this._xs[i]! + (this._xs[i + 1]! - this._xs[i]!) * t
    out.y = this._ys[i]! + (this._ys[i + 1]! - this._ys[i]!) * t
    return out
  }

  /** 走到 `distance` 处时前进方向的角度（弧度，0 朝右、顺时针为正，和节点的 `rotation` 一致）。端点的规则同 `sample`。 */
  angleAt(distance: number): number {
    const i = this._segment(distance)
    return Math.atan2(this._ys[i + 1]! - this._ys[i]!, this._xs[i + 1]! - this._xs[i]!)
  }

  /** `_segment` 算出的段内比例（0–1）：两个方法共用，不返回对象。 */
  private _t = 0

  /** `distance` 所在的折线小段的下标（这一段从第 i 个点到第 i + 1 个点），段内比例写进 `_t`。 */
  private _segment(distance: number): number {
    const lens = this._lens
    const last = lens.length - 1
    const length = this.length
    let d = distance
    if (this.closed) d = ((d % length) + length) % length
    if (!(d > 0)) {
      this._t = 0
      return 0
    }
    if (d >= length) {
      this._t = 1
      return last - 1
    }
    let lo = 0
    let hi = last
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (lens[mid]! <= d) lo = mid
      else hi = mid
    }
    const seg = lens[hi]! - lens[lo]!
    this._t = seg > 0 ? (d - lens[lo]!) / seg : 0
    return lo
  }
}

/** 检查控制点、去掉相邻的重复点（闭合时首尾重复也去掉）。 */
function prepare(kind: string, points: readonly CurvePoint[], closed: boolean): CurvePoint[] {
  const out: CurvePoint[] = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error(`Curve2D.${kind}: point ${i} is not finite (${p.x}, ${p.y}).`)
    const prev = out[out.length - 1]
    if (prev && Math.abs(prev.x - p.x) < 1e-9 && Math.abs(prev.y - p.y) < 1e-9) continue
    out.push({ x: p.x, y: p.y })
  }
  if (closed && out.length > 1) {
    const a = out[0]!
    const b = out[out.length - 1]!
    if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) out.pop()
  }
  if (out.length < (closed ? 3 : 2)) {
    throw new Error(`Curve2D.${kind}: needs at least ${closed ? 3 : 2} distinct points${closed ? ' for a closed curve' : ''}, got ${out.length}.`)
  }
  return out
}

function bakeInterval(options: Curve2DOptions): number {
  const interval = options.bakeInterval ?? 5
  if (!(interval > 0)) throw new Error(`Curve2D: bakeInterval must be > 0, got ${interval}.`)
  return interval
}

/** Centripetal Catmull-Rom（Barry–Goldman）：p1 到 p2 之间、参数 u ∈ [0, 1] 的点。相邻控制点不能重合。 */
function centripetal(p0: CurvePoint, p1: CurvePoint, p2: CurvePoint, p3: CurvePoint, u: number, out: { x: number; y: number }): void {
  const t1 = Math.sqrt(Math.hypot(p1.x - p0.x, p1.y - p0.y))
  const t2 = t1 + Math.sqrt(Math.hypot(p2.x - p1.x, p2.y - p1.y))
  const t3 = t2 + Math.sqrt(Math.hypot(p3.x - p2.x, p3.y - p2.y))
  const t = t1 + (t2 - t1) * u
  out.x = blend(p0.x, p1.x, p2.x, p3.x, t, t1, t2, t3)
  out.y = blend(p0.y, p1.y, p2.y, p3.y, t, t1, t2, t3)
}

function blend(p0: number, p1: number, p2: number, p3: number, t: number, t1: number, t2: number, t3: number): number {
  const a1 = ((t1 - t) * p0 + t * p1) / t1
  const a2 = ((t2 - t) * p1 + (t - t1) * p2) / (t2 - t1)
  const a3 = ((t3 - t) * p2 + (t - t2) * p3) / (t3 - t2)
  const b1 = ((t2 - t) * a1 + t * a2) / t2
  const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1)
  return ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1)
}
