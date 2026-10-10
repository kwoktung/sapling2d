import { FIELD, PATH } from './config'

/**
 * 怪物的路径：一条从屏幕上方到底线的 Catmull-Rom 曲线（centripetal：普通的 uniform 版本在控制点间距不均时会打结、出尖角，
 * 随机路径里约 5% 有这种情况），按弧长取点（怪物匀速前进）。
 *
 * 引擎缺口（验证清单 Curve2D）：样条插值、弧长参数化、按距离取位置和切线都在这里自己写，约 80 行。
 * 采样成折线后线性插值：每段 `PATH.samplesPerSegment` 个点，足够平滑。
 */
export class CurvePath {
  /** 折线上的点和每个点的累计弧长。 */
  private readonly _xs: Float64Array
  private readonly _ys: Float64Array
  private readonly _lens: Float64Array
  readonly length: number

  constructor(points: readonly { x: number; y: number }[]) {
    if (points.length < 2) throw new Error('CurvePath: need at least 2 points.')
    const n = PATH.samplesPerSegment
    const segs = points.length - 1
    const count = segs * n + 1
    this._xs = new Float64Array(count)
    this._ys = new Float64Array(count)
    this._lens = new Float64Array(count)
    let k = 0
    const out = { x: 0, y: 0 }
    for (let s = 0; s < segs; s++) {
      const p1 = points[s]!
      const p2 = points[s + 1]!
      // 首尾段外侧的控制点：把端点的相邻点镜像过去
      const p0 = points[s - 1] ?? { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y }
      const p3 = points[s + 2] ?? { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y }
      for (let i = 0; i < n || (s === segs - 1 && i === n); i++) {
        centripetal(p0, p1, p2, p3, i / n, out)
        this._xs[k] = out.x
        this._ys[k] = out.y
        if (k > 0) this._lens[k] = this._lens[k - 1]! + Math.hypot(this._xs[k]! - this._xs[k - 1]!, this._ys[k]! - this._ys[k - 1]!)
        k++
      }
    }
    this.length = this._lens[count - 1]!
  }

  /** 随机路径：控制点从出生高度到底线，每隔 `stepY` 一个，横坐标随机但相邻两点不超过 `maxDx`。 */
  static random(randf: (from: number, to: number) => number): CurvePath {
    const points: { x: number; y: number }[] = []
    let x = randf(FIELD.left + 40, FIELD.right - 40)
    let y = FIELD.spawnY
    points.push({ x, y })
    while (y < FIELD.baseY) {
      y = Math.min(FIELD.baseY, y + PATH.stepY + randf(-PATH.jitterY, PATH.jitterY))
      x = Math.min(FIELD.right, Math.max(FIELD.left, x + randf(-PATH.maxDx, PATH.maxDx)))
      points.push({ x, y })
    }
    // 最后一段竖直走到底线（底线以下多一点，越过底线才算漏掉）
    points.push({ x, y: FIELD.baseY + 40 })
    return new CurvePath(points)
  }

  /** 直线路径（测试用）。 */
  static line(x: number, y0: number, y1: number): CurvePath {
    return new CurvePath([
      { x, y: y0 },
      { x, y: y1 },
    ])
  }

  /** 沿路径走了 `dist` 时的位置和朝向（切线的 x 分量），写进 `out`（不分配）。超出范围时截断到端点。 */
  sample(dist: number, out: { x: number; y: number; dirX: number }): void {
    const lens = this._lens
    const last = lens.length - 1
    if (dist <= 0) return this._write(0, 0, out)
    if (dist >= this.length) return this._write(last - 1, 1, out)
    // 二分找所在的小段
    let lo = 0
    let hi = last
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (lens[mid]! <= dist) lo = mid
      else hi = mid
    }
    const segLen = lens[hi]! - lens[lo]!
    this._write(lo, segLen > 0 ? (dist - lens[lo]!) / segLen : 0, out)
  }

  private _write(i: number, t: number, out: { x: number; y: number; dirX: number }): void {
    const x0 = this._xs[i]!
    const y0 = this._ys[i]!
    const x1 = this._xs[i + 1]!
    const y1 = this._ys[i + 1]!
    out.x = x0 + (x1 - x0) * t
    out.y = y0 + (y1 - y0) * t
    out.dirX = x1 - x0
  }
}

type P = { x: number; y: number }

/** Centripetal Catmull-Rom（Barry–Goldman）：p1 到 p2 之间、参数 u ∈ [0, 1] 的点。相邻控制点不能重合。 */
function centripetal(p0: P, p1: P, p2: P, p3: P, u: number, out: P): void {
  const t1 = Math.sqrt(Math.hypot(p1.x - p0.x, p1.y - p0.y))
  const t2 = t1 + Math.sqrt(Math.hypot(p2.x - p1.x, p2.y - p1.y))
  const t3 = t2 + Math.sqrt(Math.hypot(p3.x - p2.x, p3.y - p2.y))
  const t = t1 + (t2 - t1) * u
  const mix = (a: number, b: number, ta: number, tb: number) => ((tb - t) * a + (t - ta) * b) / (tb - ta)
  for (const axis of ['x', 'y'] as const) {
    const a1 = mix(p0[axis], p1[axis], 0, t1)
    const a2 = mix(p1[axis], p2[axis], t1, t2)
    const a3 = mix(p2[axis], p3[axis], t2, t3)
    const b1 = mix(a1, a2, 0, t2)
    const b2 = mix(a2, a3, t1, t3)
    out[axis] = mix(b1, b2, t1, t2)
  }
}
