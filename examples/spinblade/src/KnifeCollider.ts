/**
 * 刀圈之间的碰撞判定：刀碰刀（clash）、刀碰身体（hit）。只做几何，不依赖引擎，可以单独测试和跑基准。
 *
 * 为什么不用引擎的 HitTester（见 .scratch/spinblade/spec.md）：
 * - 刀是细长的旋转矩形（OBB），HitTester 的矩形永远轴对齐；
 * - 刀圈转得快，相邻两个物理步之间两把刀可能直接穿过对方。这里把每一步拆成 k 个子步，在每个子步的中点采样，
 *   并把形状“膨胀”半个子步里任何一点的最大位移：物体在这个子步里的任何位置，都在中点处膨胀后的形状里，
 *   所以只要两把刀在这一步里的任何时刻重叠过，就一定会被发现（代价是最多约 1/4 刀宽的误判余量）；
 * - 刀圈的运动是按角度算出来的，可以在任意子步时刻精确重建每把刀的位置，不需要节点参与。
 *
 * 升级进引擎的条件：出现第二个需要旋转矩形判定的游戏时，把 OBB 判定挪进 HitTester（可选字段 `hitRotation`，
 * 不影响现有游戏），并修订 ADR 0007。
 */

/** 参与判定的一个角色：身体是圆，身边有一圈均匀分布的刀。位置和角度都给出这一步开始（prev）和结束时的值。 */
export interface RingBody {
  readonly x: number
  readonly y: number
  readonly prevX: number
  readonly prevY: number
  /** 第 0 把刀的方向（弧度）。`ringAngle - prevAngle` 就是这一步转过的角度（不要取模）。 */
  readonly ringAngle: number
  readonly prevAngle: number
  /** 刀的中心到角色中心的距离。 */
  readonly ringRadius: number
  /** 刀数：第 i 把刀在 `ringAngle + i·2π/n` 方向，刀身沿径向。 */
  readonly knifeCount: number
  readonly bodyRadius: number
}

export interface KnifeColliderOptions {
  /** 刀的碰撞盒：沿刀身（径向）的长度和垂直方向的宽度。 */
  knifeLength: number
  knifeWidth: number
  /** 每一步最多拆成几个子步，默认 8。超过时仍然不漏（膨胀量变大，误判余量变大）。 */
  maxSubsteps?: number
  /** false：只在这一步结束时判定一次、不膨胀（会漏掉穿过去的碰撞；只用于测试和对比）。默认 true。 */
  swept?: boolean
}

const TAU = Math.PI * 2
/** 半长、半宽各加 i 后，外接圆半径最多增加 √2·i。 */
const SQRT2 = Math.SQRT2

/**
 * 两个旋转矩形是否重叠（恰好接触也算）。矩形由中心、沿“长”方向的单位向量 (ux, uy)、半长 hl、半宽 hw 描述，
 * 宽方向是 (-uy, ux)。分离轴定理：四条轴上的投影都重叠才算重叠。
 */
export function obbOverlap(
  ax: number, ay: number, aux: number, auy: number, ahl: number, ahw: number,
  bx: number, by: number, bux: number, buy: number, bhl: number, bhw: number,
): boolean {
  const dx = bx - ax
  const dy = by - ay
  // 两组轴之间的夹角余弦：|u_a·u_b| 和 |u_a·v_b|（v 是 u 转 90°）
  const uu = Math.abs(aux * bux + auy * buy)
  const uv = Math.abs(-aux * buy + auy * bux)
  // 轴 u_a
  if (Math.abs(dx * aux + dy * auy) > ahl + bhl * uu + bhw * uv) return false
  // 轴 v_a = (-auy, aux)
  if (Math.abs(-dx * auy + dy * aux) > ahw + bhl * uv + bhw * uu) return false
  // 轴 u_b
  if (Math.abs(dx * bux + dy * buy) > bhl + ahl * uu + ahw * uv) return false
  // 轴 v_b
  if (Math.abs(-dx * buy + dy * bux) > bhw + ahl * uv + ahw * uu) return false
  return true
}

/** 旋转矩形和圆是否重叠（恰好接触也算）：圆心转到矩形的局部坐标，到矩形最近点的距离 ≤ 半径。 */
export function obbCircleOverlap(ax: number, ay: number, aux: number, auy: number, ahl: number, ahw: number, cx: number, cy: number, r: number): boolean {
  const dx = cx - ax
  const dy = cy - ay
  const lu = Math.abs(dx * aux + dy * auy) - ahl
  const lv = Math.abs(-dx * auy + dy * aux) - ahw
  const qu = lu > 0 ? lu : 0
  const qv = lv > 0 ? lv : 0
  return qu * qu + qv * qv <= r * r
}

export class KnifeCollider {
  /** 上一次 `detect` 用的子步数（没有可能相撞的角色时为 0）。 */
  substeps = 0
  private readonly _hl: number
  private readonly _hw: number
  /** 刀的外接圆半径（以刀的中心为圆心）。 */
  private readonly _hd: number
  private readonly _maxSubsteps: number
  private readonly _swept: boolean

  // 每个角色（按 rings 的下标）：刀在扁平数组里的起点、这一步的位移和转角、本子步的中心和第 0 把刀的方向
  private _offset = new Int32Array(16)
  private _move = new Float64Array(16)
  private _turn = new Float64Array(16)
  private _cx = new Float64Array(16)
  private _cy = new Float64Array(16)
  /** 本子步的膨胀量：刀、身体。 */
  private _inflK = new Float64Array(16)
  private _inflB = new Float64Array(16)
  /** 本子步已经算好刀的位置（每个子步只算一次）。 */
  private _posed = new Uint8Array(16)

  // 每把刀（扁平数组）：本子步的中心和方向；这一步已经碰过刀（之后不再参与）；这一步已经报告过砍到谁（角色下标 + 1）
  private _kx = new Float64Array(64)
  private _ky = new Float64Array(64)
  private _ku = new Float64Array(64)
  private _kv = new Float64Array(64)
  private _used = new Uint8Array(64)
  private _hitRing = new Int32Array(64)

  /** 可能相撞的角色对（a, b 交替存放）。 */
  private _pairs = new Int32Array(64)
  private _pairCount = 0

  constructor(options: KnifeColliderOptions) {
    this._hl = options.knifeLength / 2
    this._hw = options.knifeWidth / 2
    this._hd = Math.hypot(this._hl, this._hw)
    this._maxSubsteps = options.maxSubsteps ?? 8
    this._swept = options.swept ?? true
  }

  /**
   * 判定这一步（从 prev 到当前）里发生的碰撞，按子步的时间顺序报告：
   * - `onClash(a, i, b, j)`：a 的第 i 把刀和 b 的第 j 把刀相碰。两把刀在这一步里之后都不再参与判定。
   * - `onHit(a, i, b)`：a 的第 i 把刀砍到 b 的身体。同一把刀砍同一个角色，一步里只报告一次。
   * 同一子步里先判定刀碰刀，再判定刀碰身体。回调里不要修改角色的刀（下标会错位），记下来，`detect` 之后再处理。
   * 不分配内存。
   */
  detect<T extends RingBody>(rings: readonly T[], onClash: (a: T, i: number, b: T, j: number) => void, onHit: (a: T, i: number, b: T) => void): void {
    const n = rings.length
    this._prepare(rings)
    this._findPairs(rings)
    this.substeps = 0
    if (this._pairCount === 0) return

    // 子步数：让每个子步里任何一点的位移都不超过半个刀宽
    let k = 1
    if (this._swept) {
      let maxMove = 0
      const pairs = this._pairs
      for (let p = 0; p < this._pairCount * 2; p++) {
        const r = pairs[p]!
        const reach = rings[r]!.knifeCount > 0 ? rings[r]!.ringRadius + this._hd : 0
        const d = this._move[r]! + Math.abs(this._turn[r]!) * reach
        if (d > maxMove) maxMove = d
      }
      k = Math.min(this._maxSubsteps, Math.max(1, Math.ceil(maxMove / this._hw)))
    }
    this.substeps = k

    for (let r = 0; r < n; r++) {
      const ring = rings[r]!
      if (this._swept) {
        const reach = ring.knifeCount > 0 ? ring.ringRadius + this._hd : 0
        this._inflK[r] = (this._move[r]! + Math.abs(this._turn[r]!) * reach) / k / 2
        this._inflB[r] = this._move[r]! / k / 2
      } else {
        this._inflK[r] = 0
        this._inflB[r] = 0
      }
    }

    for (let s = 1; s <= k; s++) {
      // 在每个子步的中点采样：膨胀半个子步的位移正好覆盖整个子步，k 个子步覆盖整步 [0, 1]
      const t = this._swept ? (s - 0.5) / k : 1
      this._posed.fill(0, 0, n)
      const pairs = this._pairs
      for (let p = 0; p < this._pairCount; p++) {
        const a = pairs[p * 2]!
        const b = pairs[p * 2 + 1]!
        const ra = rings[a]!
        const rb = rings[b]!
        this._pose(ra, a, t)
        this._pose(rb, b, t)
        if (ra.knifeCount > 0 && rb.knifeCount > 0) this._clashes(rings, a, b, onClash)
        if (ra.knifeCount > 0) this._hits(rings, a, b, onHit)
        if (rb.knifeCount > 0) this._hits(rings, b, a, onHit)
      }
    }
  }

  /** 准备每个角色的刀在扁平数组里的位置、这一步的位移和转角；清空每把刀的状态。 */
  private _prepare(rings: readonly RingBody[]) {
    const n = rings.length
    if (this._offset.length < n + 1) this._growRings(n + 1)
    let total = 0
    for (let r = 0; r < n; r++) {
      const ring = rings[r]!
      this._offset[r] = total
      total += ring.knifeCount
      const mx = ring.x - ring.prevX
      const my = ring.y - ring.prevY
      this._move[r] = Math.sqrt(mx * mx + my * my)
      this._turn[r] = ring.ringAngle - ring.prevAngle
    }
    this._offset[n] = total
    if (this._kx.length < total) this._growKnives(total)
    this._used.fill(0, 0, total)
    this._hitRing.fill(0, 0, total)
  }

  /** 粗筛：这一步里两个角色的“刀圈 + 身体”范围有没有可能碰到（按这一步中点、整步的位移和最大膨胀量放宽）。 */
  private _findPairs(rings: readonly RingBody[]) {
    const n = rings.length
    this._pairCount = 0
    for (let a = 0; a < n; a++) {
      const ra = rings[a]!
      const reachA = this._reach(ra) + this._move[a]! / 2 + this._maxInflation(ra, a)
      const mxa = (ra.x + ra.prevX) / 2
      const mya = (ra.y + ra.prevY) / 2
      for (let b = a + 1; b < n; b++) {
        const rb = rings[b]!
        if (ra.knifeCount === 0 && rb.knifeCount === 0) continue // 两个都没有刀：碰不到
        const reach = reachA + this._reach(rb) + this._move[b]! / 2 + this._maxInflation(rb, b)
        const dx = (rb.x + rb.prevX) / 2 - mxa
        const dy = (rb.y + rb.prevY) / 2 - mya
        if (dx * dx + dy * dy > reach * reach) continue
        if (this._pairs.length < (this._pairCount + 1) * 2) this._pairs = grow(this._pairs, (this._pairCount + 1) * 4)
        this._pairs[this._pairCount * 2] = a
        this._pairs[this._pairCount * 2 + 1] = b
        this._pairCount++
      }
    }
  }

  /** 子步数为 1 时的膨胀量（子步越多越小），换算成外接圆的增量。 */
  private _maxInflation(ring: RingBody, r: number): number {
    if (!this._swept) return 0
    const reach = ring.knifeCount > 0 ? ring.ringRadius + this._hd : 0
    return (SQRT2 * (this._move[r]! + Math.abs(this._turn[r]!) * reach)) / 2
  }

  /** 角色的最大范围：刀圈的外缘或身体（取大的）。 */
  private _reach(ring: RingBody): number {
    const knives = ring.knifeCount > 0 ? ring.ringRadius + this._hd : 0
    return knives > ring.bodyRadius ? knives : ring.bodyRadius
  }

  /** 算出角色 r 在子步时刻 t 的中心和每把刀的位置、方向（每个子步只算一次）。 */
  private _pose(ring: RingBody, r: number, t: number) {
    if (this._posed[r]) return
    this._posed[r] = 1
    const cx = ring.prevX + (ring.x - ring.prevX) * t
    const cy = ring.prevY + (ring.y - ring.prevY) * t
    this._cx[r] = cx
    this._cy[r] = cy
    const n = ring.knifeCount
    if (n === 0) return
    const angle = ring.prevAngle + this._turn[r]! * t
    // 第 i 把刀的方向用复数乘法递推（每个角色只调两次三角函数）
    let c = Math.cos(angle)
    let s = Math.sin(angle)
    const sc = Math.cos(TAU / n)
    const ss = Math.sin(TAU / n)
    const rad = ring.ringRadius
    const o = this._offset[r]!
    const kx = this._kx
    const ky = this._ky
    const ku = this._ku
    const kv = this._kv
    for (let i = 0; i < n; i++) {
      kx[o + i] = cx + c * rad
      ky[o + i] = cy + s * rad
      ku[o + i] = c
      kv[o + i] = s
      const c2 = c * sc - s * ss
      s = s * sc + c * ss
      c = c2
    }
  }

  /** 角色 a、b 的刀两两判定（膨胀后的旋转矩形）。 */
  private _clashes<T extends RingBody>(rings: readonly T[], a: number, b: number, onClash: (a: T, i: number, b: T, j: number) => void) {
    const ra = rings[a]!
    const rb = rings[b]!
    const ia = this._inflK[a]!
    const ib = this._inflK[b]!
    // 两个刀圈（膨胀后）在这个子步不重叠：跳过
    const dcx = this._cx[b]! - this._cx[a]!
    const dcy = this._cy[b]! - this._cy[a]!
    const ringReach = ra.ringRadius + rb.ringRadius + 2 * this._hd + SQRT2 * (ia + ib)
    if (dcx * dcx + dcy * dcy > ringReach * ringReach) return
    const hl = this._hl
    const hw = this._hw
    // 两把刀的外接圆（膨胀后）不重叠就跳过
    const reach = 2 * this._hd + SQRT2 * (ia + ib)
    const reach2 = reach * reach
    const oa = this._offset[a]!
    const ob = this._offset[b]!
    const na = ra.knifeCount
    const nb = rb.knifeCount
    const kx = this._kx
    const ky = this._ky
    const ku = this._ku
    const kv = this._kv
    const used = this._used
    for (let i = 0; i < na; i++) {
      const ka = oa + i
      if (used[ka]) continue
      const ax = kx[ka]!
      const ay = ky[ka]!
      for (let j = 0; j < nb; j++) {
        const kb = ob + j
        if (used[kb]) continue
        const dx = kx[kb]! - ax
        const dy = ky[kb]! - ay
        if (dx * dx + dy * dy > reach2) continue
        if (!obbOverlap(ax, ay, ku[ka]!, kv[ka]!, hl + ia, hw + ia, kx[kb]!, ky[kb]!, ku[kb]!, kv[kb]!, hl + ib, hw + ib)) continue
        used[ka] = 1
        used[kb] = 1
        onClash(ra, i, rb, j)
        break
      }
    }
  }

  /** 角色 a 的刀砍角色 b 的身体。 */
  private _hits<T extends RingBody>(rings: readonly T[], a: number, b: number, onHit: (a: T, i: number, b: T) => void) {
    const ra = rings[a]!
    const rb = rings[b]!
    const ia = this._inflK[a]!
    const r = rb.bodyRadius + this._inflB[b]!
    const bx = this._cx[b]!
    const by = this._cy[b]!
    const reach = r + this._hd + SQRT2 * ia
    const reach2 = reach * reach
    const hl = this._hl + ia
    const hw = this._hw + ia
    const o = this._offset[a]!
    const n = ra.knifeCount
    const kx = this._kx
    const ky = this._ky
    for (let i = 0; i < n; i++) {
      const k = o + i
      if (this._used[k] || this._hitRing[k] === b + 1) continue
      const dx = bx - kx[k]!
      const dy = by - ky[k]!
      if (dx * dx + dy * dy > reach2) continue
      if (!obbCircleOverlap(kx[k]!, ky[k]!, this._ku[k]!, this._kv[k]!, hl, hw, bx, by, r)) continue
      this._hitRing[k] = b + 1
      onHit(ra, i, rb)
    }
  }

  private _growRings(n: number) {
    const size = Math.max(n, this._offset.length * 2)
    this._offset = new Int32Array(size)
    this._move = new Float64Array(size)
    this._turn = new Float64Array(size)
    this._cx = new Float64Array(size)
    this._cy = new Float64Array(size)
    this._inflK = new Float64Array(size)
    this._inflB = new Float64Array(size)
    this._posed = new Uint8Array(size)
  }

  private _growKnives(n: number) {
    const size = Math.max(n, this._kx.length * 2)
    this._kx = new Float64Array(size)
    this._ky = new Float64Array(size)
    this._ku = new Float64Array(size)
    this._kv = new Float64Array(size)
    this._used = new Uint8Array(size)
    this._hitRing = new Int32Array(size)
  }
}

function grow(a: Int32Array<ArrayBuffer>, size: number): Int32Array<ArrayBuffer> {
  const b = new Int32Array(Math.max(size, a.length * 2))
  b.set(a)
  return b
}
