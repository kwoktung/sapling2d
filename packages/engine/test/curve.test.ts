import { describe, expect, it } from 'vitest'
import { Curve2D, RandomNumberGenerator, v } from 'sapling2d'

const at = (c: Curve2D, d: number) => c.sample(d, { x: 0, y: 0 })
/** 点到烘焙折线的最近距离（按很密的采样近似）。 */
const distanceToCurve = (c: Curve2D, p: { x: number; y: number }) => {
  let best = Infinity
  for (let i = 0; i <= 2000; i++) {
    const q = at(c, (c.length * i) / 2000)
    best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y))
  }
  return best
}

describe('Curve2D.polyline', () => {
  it('长度、按距离取点、方向；开放曲线超出范围时停在端点', () => {
    const c = Curve2D.polyline([v(0, 0), v(100, 0), v(100, 50)])
    expect(c.length).toBe(150)
    expect(at(c, 50)).toEqual({ x: 50, y: 0 })
    expect(at(c, 125)).toEqual({ x: 100, y: 25 })
    expect(c.angleAt(50)).toBe(0) // 朝右
    expect(c.angleAt(125)).toBeCloseTo(Math.PI / 2) // 朝下（y 轴向下）
    expect(at(c, -10)).toEqual({ x: 0, y: 0 })
    expect(at(c, 999)).toEqual({ x: 100, y: 50 })
    expect(c.angleAt(999)).toBeCloseTo(Math.PI / 2)
  })

  it('闭合：连回起点，距离绕回（负数往回绕）', () => {
    const c = Curve2D.polyline([v(0, 0), v(100, 0), v(100, 100), v(0, 100)], { closed: true })
    expect(c.length).toBe(400)
    expect(at(c, 350)).toEqual({ x: 0, y: 50 })
    expect(at(c, 450)).toEqual({ x: 50, y: 0 })
    expect(at(c, -50)).toEqual({ x: 0, y: 50 })
  })

  it('out 原样返回（可以传任何带 x / y 的对象）', () => {
    const out = { x: 0, y: 0, extra: 1 }
    expect(Curve2D.polyline([v(0, 0), v(10, 0)]).sample(5, out)).toBe(out)
  })
})

describe('Curve2D.catmullRom', () => {
  it('经过每一个控制点；两端就是首尾控制点', () => {
    const pts = [v(100, -40), v(500, 300), v(200, 700), v(400, 1200)]
    const c = Curve2D.catmullRom(pts)
    expect(at(c, 0)).toEqual({ x: 100, y: -40 })
    const end = at(c, c.length)
    expect([end.x, end.y]).toEqual([expect.closeTo(400), expect.closeTo(1200)])
    for (const p of pts) expect(distanceToCurve(c, p)).toBeLessThan(0.5)
  })

  it('按弧长取点：等距取点的间距相同；随机控制点也不出尖角（uniform Catmull-Rom 约 5% 会出）', () => {
    const rng = new RandomNumberGenerator(7)
    for (let n = 0; n < 200; n++) {
      // 和塔防原型一样的随机路径：纵向每 150–230 一个点，横向随机大幅摆动
      const pts = [v(rng.randfRange(100, 650), -40)]
      for (let y = -40; y < 1120; ) {
        y = Math.min(1120, y + rng.randfRange(150, 230))
        pts.push(v(Math.min(690, Math.max(60, pts[pts.length - 1]!.x + rng.randfRange(-260, 260))), y))
      }
      pts.push(v(pts[pts.length - 1]!.x, 1160))
      const c = Curve2D.catmullRom(pts)
      const steps = 300
      let prev = at(c, 0)
      for (let i = 1; i <= steps; i++) {
        const p = at(c, (c.length * i) / steps)
        const ratio = Math.hypot(p.x - prev.x, p.y - prev.y) / (c.length / steps)
        expect(ratio).toBeGreaterThan(0.85) // 弯道上直线距离略短于弧长；尖角处会掉到 0.1 以下
        expect(ratio).toBeLessThan(1 + 1e-9)
        prev = p
      }
    }
  })

  it('闭合：首尾平滑相接，绕回起点', () => {
    const c = Curve2D.catmullRom([v(0, 0), v(200, 0), v(200, 200), v(0, 200)], { closed: true })
    expect(at(c, 0)).toEqual({ x: 0, y: 0 })
    const back = at(c, c.length)
    expect([back.x, back.y]).toEqual([expect.closeTo(0), expect.closeTo(0)])
    // 经过起点时方向连续（不是尖角）：起点前后的方向差很小
    const before = c.angleAt(c.length - 1)
    const after = c.angleAt(1)
    expect(Math.abs(Math.atan2(Math.sin(after - before), Math.cos(after - before)))).toBeLessThan(0.1)
    expect(at(c, c.length + 10)).toEqual(at(c, 10))
  })

  it('bakeInterval 越小越精确（长度收敛）', () => {
    const pts = [v(0, 0), v(300, 100), v(0, 400)]
    const coarse = Curve2D.catmullRom(pts, { bakeInterval: 50 }).length
    const fine = Curve2D.catmullRom(pts, { bakeInterval: 1 }).length
    const finer = Curve2D.catmullRom(pts, { bakeInterval: 0.25 }).length
    expect(Math.abs(fine - finer)).toBeLessThan(Math.abs(coarse - finer))
    expect(Math.abs(fine - finer)).toBeLessThan(0.05)
  })
})

describe('Curve2D：控制点', () => {
  it('相邻的重复点被去掉（否则 centripetal 会除以零）；闭合时首尾重复也去掉', () => {
    const c = Curve2D.catmullRom([v(0, 0), v(0, 0), v(100, 0), v(100, 0), v(100, 100)])
    expect(Number.isFinite(c.length)).toBe(true)
    expect(c.length).toBeGreaterThan(150)
    const loop = Curve2D.polyline([v(0, 0), v(10, 0), v(10, 10), v(0, 0)], { closed: true })
    expect(loop.length).toBeCloseTo(20 + Math.SQRT2 * 10)
  })

  it('点不够、不是有限数、bakeInterval 不合法时报错', () => {
    expect(() => Curve2D.catmullRom([v(1, 1)])).toThrow(/catmullRom: needs at least 2 distinct points, got 1/)
    expect(() => Curve2D.polyline([v(1, 1), v(1, 1)])).toThrow(/needs at least 2 distinct points, got 1/)
    expect(() => Curve2D.polyline([v(0, 0), v(1, 0)], { closed: true })).toThrow(/at least 3 distinct points for a closed curve/)
    expect(() => Curve2D.catmullRom([v(0, 0), { x: NaN, y: 0 }])).toThrow(/point 1 is not finite/)
    expect(() => Curve2D.catmullRom([v(0, 0), v(1, 0)], { bakeInterval: 0 })).toThrow(/bakeInterval must be > 0/)
  })

  it('接受任何带 x / y 的对象（例如 Tiled 对象的 points）', () => {
    expect(Curve2D.polyline([{ x: 0, y: 0 }, { x: 3, y: 4 }]).length).toBe(5)
  })
})
