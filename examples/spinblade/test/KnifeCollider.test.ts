import { describe, expect, it } from 'vitest'
import { KnifeCollider, obbCircleOverlap, obbOverlap, type RingBody } from '../src/KnifeCollider'

const LEN = 60
const WID = 12
const HL = LEN / 2
const HW = WID / 2
const DT = 1 / 60
/** 测试用的最高转速（弧度/秒）：比游戏里的转速高一倍。 */
const MAX_SPIN = 7
const TAU = Math.PI * 2

interface Ring extends RingBody {
  x: number
  y: number
  prevX: number
  prevY: number
  ringAngle: number
  prevAngle: number
  ringRadius: number
  knifeCount: number
  bodyRadius: number
}

const radiusFor = (n: number) => Math.max(78, (n * 26) / TAU)

function ring(o: Partial<Ring> & { x: number; y: number; knifeCount: number }): Ring {
  return { prevX: o.x, prevY: o.y, ringAngle: 0, prevAngle: 0, ringRadius: radiusFor(o.knifeCount), bodyRadius: 36, ...o }
}

/** 第 i 把刀在时刻 t（0–1）的中心和方向。 */
function knifeAt(r: Ring, i: number, t: number) {
  const cx = r.prevX + (r.x - r.prevX) * t
  const cy = r.prevY + (r.y - r.prevY) * t
  const a = r.prevAngle + (r.ringAngle - r.prevAngle) * t + (i * TAU) / r.knifeCount
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  return { x: cx + ux * r.ringRadius, y: cy + uy * r.ringRadius, ux, uy }
}

/** 参考答案：在 [from, 1] 里密集采样（samples 为 0 时只看 from 这一刻），任何一对刀重叠过就算碰到。`grow` 把两把刀的半长、半宽都加大。 */
function referenceClash(a: Ring, b: Ring, from: number, grow = 0, samples = 400): boolean {
  const reach = 2 * Math.hypot(HL + grow, HW + grow)
  for (let s = 0; s <= samples; s++) {
    const t = samples === 0 ? from : from + ((1 - from) * s) / samples
    for (let i = 0; i < a.knifeCount; i++) {
      const p = knifeAt(a, i, t)
      for (let j = 0; j < b.knifeCount; j++) {
        const q = knifeAt(b, j, t)
        if (Math.abs(p.x - q.x) > reach || Math.abs(p.y - q.y) > reach) continue
        if (obbOverlap(p.x, p.y, p.ux, p.uy, HL + grow, HW + grow, q.x, q.y, q.ux, q.uy, HL + grow, HW + grow)) return true
      }
    }
  }
  return false
}

function clashesOf(collider: KnifeCollider, rings: Ring[]) {
  const clashes: [Ring, number, Ring, number][] = []
  const hits: [Ring, number, Ring][] = []
  collider.detect(rings, (a, i, b, j) => clashes.push([a, i, b, j]), (a, i, b) => hits.push([a, i, b]))
  return { clashes, hits }
}

/** 可复现的随机数。 */
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000)
}

/** 随机场景：两个刀圈以最高转速反向旋转、各自移动（最快 360 px/s），刀圈有交叉。这一步开始时没有刀重叠。 */
function scenarios(count: number, seed: number) {
  const rand = rng(seed)
  const list: [Ring, Ring][] = []
  while (list.length < count) {
    const na = 1 + Math.floor(rand() * 12)
    const nb = 1 + Math.floor(rand() * 12)
    const ra = radiusFor(na)
    const rb = radiusFor(nb)
    const d = Math.abs(ra - rb) + rand() * (ra + rb + LEN - Math.abs(ra - rb))
    const dir = rand() * TAU
    const move = () => (rand() - 0.5) * 2 * 360 * DT
    const a0 = rand() * TAU
    const b0 = rand() * TAU
    const a: Ring = ring({ knifeCount: na, x: 0, y: 0, prevAngle: a0, ringAngle: a0 + MAX_SPIN * DT })
    const b: Ring = ring({ knifeCount: nb, x: Math.cos(dir) * d, y: Math.sin(dir) * d, prevAngle: b0, ringAngle: b0 - MAX_SPIN * DT })
    a.prevX = a.x - move()
    a.prevY = a.y - move()
    b.prevX = b.x - move()
    b.prevY = b.y - move()
    if (referenceClash(a, b, 0, 0, 0)) continue // 开始时就重叠：上一步应该已经碰到了
    list.push([a, b])
  }
  return list
}

describe('旋转矩形的判定', () => {
  it('OBB × OBB：相交、恰好接触、分离、各种角度', () => {
    // 两把横着的刀：中心相距 60 恰好接触（半长 30 + 30）
    expect(obbOverlap(0, 0, 1, 0, HL, HW, 60, 0, 1, 0, HL, HW)).toBe(true)
    expect(obbOverlap(0, 0, 1, 0, HL, HW, 60.01, 0, 1, 0, HL, HW)).toBe(false)
    // 十字交叉
    expect(obbOverlap(0, 0, 1, 0, HL, HW, 0, 0, 0, 1, HL, HW)).toBe(true)
    // 平行错开一个刀宽
    expect(obbOverlap(0, 0, 1, 0, HL, HW, 0, 12, 1, 0, HL, HW)).toBe(true)
    expect(obbOverlap(0, 0, 1, 0, HL, HW, 0, 12.01, 1, 0, HL, HW)).toBe(false)
    // 45° 的刀：轴对齐包围盒重叠，但刀身没碰到（轴对齐判定会误判）
    const c = Math.SQRT1_2
    expect(obbOverlap(0, 0, c, c, HL, HW, 30, -30, c, c, HL, HW)).toBe(false)
    expect(obbOverlap(0, 0, c, c, HL, HW, 8, -8, c, c, HL, HW)).toBe(true)
    // 刀尖碰刀身：竖刀的刀尖（y = -30 - 30 = -60 处）刚好到横刀的下边缘
    expect(obbOverlap(0, 0, 1, 0, HL, HW, 0, HW + HL, 0, 1, HL, HW)).toBe(true)
    expect(obbOverlap(0, 0, 1, 0, HL, HW, 0, HW + HL + 0.01, 0, 1, HL, HW)).toBe(false)
  })

  it('OBB × 圆', () => {
    expect(obbCircleOverlap(0, 0, 1, 0, HL, HW, 0, 0, 1)).toBe(true)
    expect(obbCircleOverlap(0, 0, 1, 0, HL, HW, 0, HW + 10, 10)).toBe(true)
    expect(obbCircleOverlap(0, 0, 1, 0, HL, HW, 0, HW + 10.01, 10)).toBe(false)
    // 角上：到角 (30, 6) 的距离
    expect(obbCircleOverlap(0, 0, 1, 0, HL, HW, 33, 10, 5)).toBe(true)
    expect(obbCircleOverlap(0, 0, 1, 0, HL, HW, 34, 10, 5)).toBe(false)
    // 竖着的刀
    expect(obbCircleOverlap(0, 0, 0, 1, HL, HW, 0, 40, 10)).toBe(true)
    expect(obbCircleOverlap(0, 0, 0, 1, HL, HW, 20, 0, 10)).toBe(false)
  })
})

describe('KnifeCollider', () => {
  it('刀圈以最高转速反向交叉：参考答案里碰到的，一次都不漏', () => {
    const collider = new KnifeCollider({ knifeLength: LEN, knifeWidth: WID })
    let expected = 0
    let missed = 0
    for (const [a, b] of scenarios(1500, 1)) {
      if (!referenceClash(a, b, 0)) continue
      expected++
      if (clashesOf(collider, [a, b]).clashes.length === 0) missed++
    }
    expect(expected).toBeGreaterThan(200) // 场景里确实有足够多的碰撞
    expect(missed).toBe(0)
  })

  it('不拆子步（只在步末判定一次）会漏：证明子步有效', () => {
    const collider = new KnifeCollider({ knifeLength: LEN, knifeWidth: WID, swept: false })
    let missed = 0
    for (const [a, b] of scenarios(1500, 1)) {
      if (referenceClash(a, b, 0) && clashesOf(collider, [a, b]).clashes.length === 0) missed++
    }
    expect(missed).toBeGreaterThan(0)
  })

  it('误判有上限：报告碰到的，把刀加宽 1/4 刀宽后参考答案也一定碰到', () => {
    const collider = new KnifeCollider({ knifeLength: LEN, knifeWidth: WID })
    for (const [a, b] of scenarios(1500, 2)) {
      if (clashesOf(collider, [a, b]).clashes.length === 0) continue
      expect(collider.substeps).toBeLessThan(8) // 没有被子步上限截断（截断时膨胀会更大）
      expect(referenceClash(a, b, 0, HW / 2)).toBe(true)
    }
  })

  it('刀砍身体：参考答案里砍到的刀都报告，每把刀一步只报告一次', () => {
    const collider = new KnifeCollider({ knifeLength: LEN, knifeWidth: WID })
    const rand = rng(3)
    let expected = 0
    for (let n = 0; n < 500; n++) {
      const knives = 1 + Math.floor(rand() * 10)
      const a = ring({ knifeCount: knives, x: 0, y: 0, prevAngle: 0, ringAngle: MAX_SPIN * DT })
      a.prevAngle = rand() * TAU
      a.ringAngle = a.prevAngle + MAX_SPIN * DT
      const d = rand() * (a.ringRadius + HL + 40)
      const dir = rand() * TAU
      const body = ring({ knifeCount: 0, x: Math.cos(dir) * d, y: Math.sin(dir) * d })
      body.prevX = body.x - 6
      const want = new Set<number>()
      for (let s = 0; s <= 400; s++) {
        const t = s / 400
        const bx = body.prevX + (body.x - body.prevX) * t
        for (let i = 0; i < knives; i++) {
          const p = knifeAt(a, i, t)
          if (obbCircleOverlap(p.x, p.y, p.ux, p.uy, HL, HW, bx, body.y, body.bodyRadius)) want.add(i)
        }
      }
      expected += want.size
      const { hits } = clashesOf(collider, [a, body])
      const got = hits.map(([, i]) => i)
      expect(new Set(got).size).toBe(got.length)
      for (const i of want) expect(got).toContain(i)
      for (const [x, , y] of hits) expect([x, y]).toEqual([a, body])
    }
    expect(expected).toBeGreaterThan(200)
  })

  it('碰过刀的刀这一步不再砍身体，也不再碰别的刀', () => {
    const collider = new KnifeCollider({ knifeLength: LEN, knifeWidth: WID })
    // a 的刀朝右（x 48–108），压在 b 的刀（朝左，x 32–92）上，刀尖还够得着 b 的身体（x 104–176）；
    // c 的刀竖着放在 (80, 0)，和 a、b 的刀都重叠
    const a = ring({ knifeCount: 1, x: 0, y: 0, ringRadius: 78 })
    const b = ring({ knifeCount: 1, x: 140, y: 0, ringRadius: 78, ringAngle: Math.PI, prevAngle: Math.PI })
    const c = ring({ knifeCount: 1, x: 80, y: 160, ringRadius: 160, ringAngle: -Math.PI / 2, prevAngle: -Math.PI / 2 })
    // 先确认：不算碰刀的话，a 的刀会砍到 b 的身体
    expect(clashesOf(collider, [a, ring({ ...b, knifeCount: 0 })]).hits).toHaveLength(1)
    const { clashes, hits } = clashesOf(collider, [a, b, c])
    expect(clashes).toEqual([[a, 0, b, 0]])
    const used = new Set(clashes.flatMap(([ra, i, rb, j]) => [`${[a, b, c].indexOf(ra)}:${i}`, `${[a, b, c].indexOf(rb)}:${j}`]))
    for (const [r, i] of hits) expect(used.has(`${[a, b, c].indexOf(r)}:${i}`)).toBe(false)
  })

  it('离得远、没有刀的角色之间不判定', () => {
    const collider = new KnifeCollider({ knifeLength: LEN, knifeWidth: WID })
    const a = ring({ knifeCount: 6, x: 0, y: 0 })
    const b = ring({ knifeCount: 6, x: 500, y: 0 })
    const c = ring({ knifeCount: 0, x: 0, y: 300 })
    const d = ring({ knifeCount: 0, x: 40, y: 300 })
    expect(clashesOf(collider, [a, b, c, d])).toEqual({ clashes: [], hits: [] })
    expect(collider.substeps).toBe(0)
  })
})
