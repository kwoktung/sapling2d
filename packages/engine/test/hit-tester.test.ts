import { describe, expect, it } from 'vitest'
import { circle, HitTester, type Hittable, Node2D, polygon, rectangle, Scene, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

interface Obj extends Hittable {
  name: string
  x: number
  y: number
  dead?: boolean
}

const c = (name: string, x: number, y: number, r: number): Obj => ({ name, x, y, hitShape: circle(r) })
const r = (name: string, x: number, y: number, w: number, h: number): Obj => ({ name, x, y, hitShape: rectangle(w, h) })

function pairs(as: Obj[], bs: Obj[], consume = false): string[] {
  const out: string[] = []
  new HitTester().forEachHit(as, bs, (a, b) => {
    out.push(`${a.name}-${b.name}`)
    return consume
  })
  return out
}

describe('HitTester 形状组合', () => {
  it('圆 × 圆：相交、恰好接触算命中，相离不算', () => {
    expect(pairs([c('a', 0, 0, 10)], [c('in', 15, 0, 10), c('touch', 20, 0, 10), c('out', 20.01, 0, 10)])).toEqual(['a-in', 'a-touch'])
  })

  it('矩形 × 矩形：按两轴分别比较', () => {
    const a = r('a', 0, 0, 20, 10) // 半宽 10、半高 5
    expect(pairs([a], [r('x', 25, 0, 30, 2), r('edge', 0, 10, 4, 10), r('far', 0, 10.01, 4, 10), r('diag', 20, 10, 20, 10)])).toEqual(['a-x', 'a-edge', 'a-diag'])
  })

  it('圆 × 矩形：边上和角上，两个方向都对', () => {
    const box = r('box', 0, 0, 20, 20) // 半边 10
    const side = c('side', 15, 0, 5)
    const cornerHit = c('cornerHit', 13, 13, 5) // 到角 (10,10) 距离 √18 ≈ 4.24
    const cornerMiss = c('cornerMiss', 14, 14, 5) // 距离 √32 ≈ 5.66：外接框重叠但圆没碰到角
    const inside = c('inside', 2, -3, 1)
    expect(pairs([box], [side, cornerHit, cornerMiss, inside])).toEqual(['box-side', 'box-cornerHit', 'box-inside'])
    expect(pairs([side, cornerHit, cornerMiss, inside], [box])).toEqual(['side-box', 'cornerHit-box', 'inside-box'])
  })

  it('polygon 形状会报错', () => {
    const p = { x: 0, y: 0, hitShape: polygon([v(0, 0), v(10, 0), v(0, 10)]) } as unknown as Obj
    expect(() => pairs([c('a', 0, 0, 1)], [p])).toThrow(/Area2D/)
  })
})

describe('HitTester 命中规则', () => {
  it('回调返回 true：a 用掉了，不再和其他 b 比较', () => {
    const bs = [c('b1', 0, 0, 5), c('b2', 1, 0, 5)]
    expect(pairs([c('a', 0, 0, 1)], bs, true)).toEqual(['a-b1'])
    expect(pairs([c('a', 0, 0, 1)], bs, false)).toEqual(['a-b1', 'a-b2'])
  })

  it('dead 的对象不参与；回调里让 b 失效后，后面的 a 不再命中它', () => {
    const enemy = c('enemy', 0, 0, 10)
    const bullets = [c('s1', 0, 0, 1), c('s2', 0, 0, 1), { ...c('s0', 0, 0, 1), dead: true }]
    const out: string[] = []
    new HitTester().forEachHit(bullets, [enemy], (a, b) => {
      out.push(a.name)
      b.dead = true
      return true
    })
    expect(out).toEqual(['s1'])
    expect(pairs([c('a', 0, 0, 1)], [{ ...enemy, dead: true }])).toEqual([])
  })

  it('节点 queueFree 后不再参与，compact 会去掉它', async () => {
    class Dot extends Node2D {
      readonly hitShape = circle(5)
    }
    class S extends Scene {
      dots: Dot[] = []
      override ready() {
        for (let i = 0; i < 3; i++) this.dots.push(this.add(new Dot({ position: v(i, 0) })))
      }
    }
    const g = await createTestGame({ main: S })
    const dots = g.scene.dots
    const probe = [c('p', 0, 0, 1)]
    const hits: Dot[] = []
    const tester = new HitTester()
    tester.forEachHit(probe, dots, (_, d) => {
      hits.push(d)
      d.queueFree()
      return false
    })
    expect(hits).toHaveLength(3)
    hits.length = 0
    dots[1]!.queueFree()
    tester.forEachHit(probe, dots, (_, d) => (hits.push(d), false))
    expect(hits).toHaveLength(0)
    HitTester.compact(dots)
    expect(dots).toHaveLength(0)
  })

  it('节点销毁后（isQueuedForDeletion 变回 false）仍然算失效', async () => {
    class Dot extends Node2D {
      readonly hitShape = circle(5)
    }
    const g = await createTestGame({ main: Scene })
    const dot = g.scene.add(new Dot({ position: v(0, 0) }))
    dot.queueFree()
    g.step()
    expect(dot.isFreed).toBe(true)
    expect(dot.isQueuedForDeletion).toBe(false)
    const dots = [dot]
    const hits: Dot[] = []
    new HitTester().forEachHit([c('p', 0, 0, 1)], dots, (_, d) => (hits.push(d), true))
    expect(hits).toHaveLength(0)
    HitTester.compact(dots)
    expect(dots).toHaveLength(0)
  })

  it('同一个数组组内判定：不和自己比较，每一对报告两次', () => {
    const list = [c('a', 0, 0, 5), c('b', 8, 0, 5), c('far', 100, 0, 5)]
    const out: string[] = []
    new HitTester().forEachHit(list, list, (a, b) => (out.push(`${a.name}-${b.name}`), true))
    expect(out).toEqual(['a-b', 'b-a'])
  })

  it('compact 不要求 hitShape', () => {
    const list: { dead: boolean }[] = [{ dead: false }, { dead: true }]
    HitTester.compact(list)
    expect(list).toHaveLength(1)
  })

  it('b 组超过初始容量时自动扩容', () => {
    const bs: Obj[] = []
    for (let i = 0; i < 200; i++) bs.push(c(`b${i}`, i * 100, 0, 1))
    const tester = new HitTester()
    const hits: string[] = []
    tester.forEachHit([c('a', 150 * 100, 0, 1)], bs, (_, b) => (hits.push(b.name), true))
    tester.forEachHit([c('a', 3 * 100, 0, 1)], bs.slice(0, 10), (_, b) => (hits.push(b.name), true))
    expect(hits).toEqual(['b150', 'b3'])
  })

  it('compact 原地去掉 dead 的对象，保持顺序', () => {
    const list = [c('a', 0, 0, 1), { ...c('b', 0, 0, 1), dead: true }, c('c', 0, 0, 1)]
    const same = list
    HitTester.compact(list)
    expect(list).toBe(same)
    expect(list.map((o) => o.name)).toEqual(['a', 'c'])
  })
})
