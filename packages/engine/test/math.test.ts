import { describe, expect, it } from 'vitest'
import { Node2D, Vector2, v } from 'sapling2d'

describe('Vector2', () => {
  it('不可变：运算返回新实例，实例被冻结', () => {
    const a = v(1, 2)
    const b = a.add(v(3, 4))
    expect(a).toEqual(v(1, 2))
    expect(b).toEqual(v(4, 6))
    expect(Object.isFrozen(a)).toBe(true)
    expect(() => {
      ;(a as { x: number }).x = 9
    }).toThrow()
  })

  it('常用运算', () => {
    expect(v(3, 4).length()).toBe(5)
    expect(v(3, 4).normalized().isEqualApprox(v(0.6, 0.8))).toBe(true)
    expect(Vector2.ZERO.normalized()).toBe(Vector2.ZERO)
    expect(v(1, 2).mul(2)).toEqual(v(2, 4))
    expect(v(1, 2).mul(v(3, 4))).toEqual(v(3, 8))
    expect(v(1, 0).rotated(Math.PI / 2).isEqualApprox(v(0, 1))).toBe(true)
    expect(v(0, 0).lerp(v(10, 20), 0.5)).toEqual(v(5, 10))
    expect(v(1.234, 5).toString()).toBe('(1.23, 5)')
  })
})

describe('Node2D', () => {
  it('position 通过重新赋值修改，x / y 是快捷属性，修改会让 _version 递增', () => {
    const n = new Node2D({ position: v(1, 2) })
    const before = n._version
    n.x += 10
    n.y = 5
    expect(n.position).toEqual(v(11, 5))
    n.position = n.position.add(v(1, 1))
    expect(n.position).toEqual(v(12, 6))
    expect(n._version).toBe(before + 3)
  })

  it('rotationDegrees 与 rotation 互相换算', () => {
    const n = new Node2D()
    n.rotationDegrees = 180
    expect(n.rotation).toBeCloseTo(Math.PI)
    n.rotation = Math.PI / 2
    expect(n.rotationDegrees).toBeCloseTo(90)
  })
})
