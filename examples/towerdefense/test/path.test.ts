import { describe, expect, it } from 'vitest'
import { RandomNumberGenerator } from 'sapling2d'
import { FIELD } from '../src/config'
import { randomPath } from '../src/path'

// 曲线本身（按弧长取点、不出尖角）由引擎的 Curve2D 测试覆盖；这里只测随机路线的形状。
describe('randomPath', () => {
  it('从屏幕上方出发、越过底线结束、横向不出界', () => {
    const rng = new RandomNumberGenerator(7)
    const out = { x: 0, y: 0 }
    for (let n = 0; n < 100; n++) {
      const p = randomPath((a, b) => rng.randfRange(a, b))
      expect(p.sample(0, out).y).toBeCloseTo(FIELD.spawnY)
      expect(p.sample(p.length, out).y).toBeGreaterThan(FIELD.baseY)
      for (let i = 0; i <= 200; i++) {
        p.sample((p.length * i) / 200, out)
        expect(out.x).toBeGreaterThan(FIELD.left - 40) // 曲线会略微越过控制点
        expect(out.x).toBeLessThan(FIELD.right + 40)
      }
    }
  })
})
