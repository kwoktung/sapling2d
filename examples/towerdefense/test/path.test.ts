import { describe, expect, it } from 'vitest'
import { RandomNumberGenerator } from 'sapling2d'
import { FIELD } from '../src/config'
import { CurvePath } from '../src/path'

describe('CurvePath', () => {
  it('直线：长度和按距离取点', () => {
    const p = CurvePath.line(100, 0, 500)
    expect(p.length).toBeCloseTo(500)
    const out = { x: 0, y: 0, dirX: 0 }
    p.sample(200, out)
    expect([out.x, out.y]).toEqual([expect.closeTo(100), expect.closeTo(200)])
    p.sample(-5, out)
    expect(out.y).toBeCloseTo(0)
    p.sample(9999, out)
    expect(out.y).toBeCloseTo(500)
  })

  it('随机曲线：从屏幕上方出发、越过底线结束、横向不出界；按弧长取点、没有尖角', () => {
    const rng = new RandomNumberGenerator(7)
    for (let n = 0; n < 100; n++) {
      const p = CurvePath.random((a, b) => rng.randfRange(a, b))
      const out = { x: 0, y: 0, dirX: 0 }
      p.sample(0, out)
      expect(out.y).toBeCloseTo(FIELD.spawnY)
      p.sample(p.length, out)
      expect(out.y).toBeGreaterThan(FIELD.baseY)
      const steps = 200
      let prevX = 0
      let prevY = 0
      for (let i = 0; i <= steps; i++) {
        p.sample((p.length * i) / steps, out)
        expect(out.x).toBeGreaterThan(FIELD.left - 40) // Catmull-Rom 会略微越过控制点
        expect(out.x).toBeLessThan(FIELD.right + 40)
        // 弯道上两点的直线距离比弧长略短；没有尖角（uniform Catmull-Rom 会出现，比值掉到 0.1 以下）
        if (i > 0) expect(Math.hypot(out.x - prevX, out.y - prevY) / (p.length / steps)).toBeGreaterThan(0.85)
        prevX = out.x
        prevY = out.y
      }
    }
  })
})
