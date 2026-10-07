import { describe, expect, it } from 'vitest'
import { circle, CollisionShape2D, Node2D, rectangle, RigidBody2D, Scene, StaticBody2D, v, type PhysicsSettings, type Vector2 } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

function ball(position: Vector2, radius = 20, opts: ConstructorParameters<typeof RigidBody2D>[0] = {}) {
  const b = new RigidBody2D({ position, ...opts })
  b.add(new CollisionShape2D({ shape: circle(radius) }))
  return b
}

/** 地面上表面在 y = 1000 */
function ground() {
  const g = new StaticBody2D({ name: 'Ground', position: v(375, 1050) })
  g.add(new CollisionShape2D({ shape: rectangle(2000, 100) }))
  return g
}

describe('RigidBody2D', () => {
  it('自由落体：1 秒后下落约 ½·g·t² = 490 像素，速度约 980 px/s', async () => {
    const g = await createTestGame({ main: Scene })
    const b = g.scene.add(ball(v(100, 100)))
    g.step(60)
    expect(b.y - 100).toBeGreaterThan(490 * 0.97)
    expect(b.y - 100).toBeLessThan(490 * 1.03)
    expect(b.linearVelocity.y).toBeCloseTo(980, -1)
    expect(b.x).toBe(100)
  })

  it('落在静态地面上并静止，最终休眠', async () => {
    const g = await createTestGame({ main: Scene })
    g.scene.add(ground())
    const b = g.scene.add(ball(v(375, 500), 30))
    g.stepSeconds(5)
    expect(b.y).toBeCloseTo(1000 - 30, 0)
    expect(b.sleeping).toBe(true)
    expect(g.dump()).toContain('sleeping=true')
  })

  it('确定性：同一个 seed、同样的操作，两次运行的 dump 完全相同', async () => {
    const run = async () => {
      const g = await createTestGame({ main: Scene, seed: 42 })
      g.scene.add(ground())
      for (let i = 0; i < 30; i++) {
        g.scene.add(ball(v(300 + g.tree.rng.randfRange(-100, 100), 200 - i * 30), g.tree.rng.randfRange(15, 40), { bounce: 0.2 }))
        g.step(5)
      }
      g.stepSeconds(2)
      return g.dump()
    }
    const a = await run()
    expect(await run()).toBe(a)
    expect(a.split('\n').length).toBeGreaterThan(30)
  })

  it('赋值 position 等于瞬移：位置立即生效，速度清零', async () => {
    const g = await createTestGame({ main: Scene })
    const b = g.scene.add(ball(v(100, 100)))
    g.step(30)
    expect(b.linearVelocity.y).toBeGreaterThan(100)
    b.position = v(500, 50)
    g.step()
    expect(b.x).toBeCloseTo(500)
    expect(b.y).toBeLessThan(51) // 只下落了一步
    expect(b.linearVelocity.y).toBeLessThan(20)
  })

  it('冲量：Δv = 冲量 / 质量；质量不影响下落速度', async () => {
    const g = await createTestGame({ main: Scene, physics: { gravity: v(0, 0) } })
    const light = g.scene.add(ball(v(100, 100), 20, { mass: 1 }))
    const heavy = g.scene.add(ball(v(100, 300), 20, { mass: 4 }))
    light.applyCentralImpulse(v(200, 0)) // 刚体还没创建：排队，创建时生效
    heavy.applyCentralImpulse(v(200, 0))
    g.step()
    expect(light.linearVelocity.x).toBeCloseTo(200)
    expect(heavy.linearVelocity.x).toBeCloseTo(50)

    const g2 = await createTestGame({ main: Scene })
    const a = g2.scene.add(ball(v(100, 100), 20, { mass: 1 }))
    const b = g2.scene.add(ball(v(300, 100), 20, { mass: 10 }))
    g2.step(30)
    expect(a.y).toBeCloseTo(b.y, 5)
  })

  it('初始速度、gravityScale、lockRotation', async () => {
    const g = await createTestGame({ main: Scene })
    const b = g.scene.add(ball(v(100, 100), 20, { linearVelocity: v(120, 0), gravityScale: 0, lockRotation: true }))
    b.angularVelocity = 5
    g.step(60)
    expect(b.x).toBeCloseTo(220, 0)
    expect(b.y).toBeCloseTo(100)
    expect(b.rotation).toBe(0)
  })

  it('父节点有偏移时：物理按全局坐标计算，写回父节点局部坐标', async () => {
    const g = await createTestGame({ main: Scene })
    g.scene.add(ground())
    const container = g.scene.add(new Node2D({ position: v(200, 0) }))
    const b = container.add(ball(v(100, 500), 30))
    g.stepSeconds(5)
    expect(b.globalPosition.x).toBeCloseTo(300)
    expect(b.globalPosition.y).toBeCloseTo(970, 0)
    expect(b.x).toBeCloseTo(100)
  })

  it('pixelsPerMeter 只影响内部单位：像素空间的下落结果一致', async () => {
    const fall = async (physics: PhysicsSettings) => {
      const g = await createTestGame({ main: Scene, physics })
      const b = g.scene.add(ball(v(100, 100)))
      g.step(45)
      return b.y
    }
    expect(await fall({ pixelsPerMeter: 100 })).toBeCloseTo(await fall({ pixelsPerMeter: 30 }), 3)
  })

  it('销毁、移出、重新加入：刚体随之创建和销毁，速度保留', async () => {
    const g = await createTestGame({ main: Scene })
    const b = g.scene.add(ball(v(100, 100)))
    g.step(10)
    expect(g.tree.physics.bodyCount).toBe(1)
    const vy = b.linearVelocity.y
    g.scene.remove(b)
    expect(g.tree.physics.bodyCount).toBe(0)
    g.scene.add(b)
    g.step()
    expect(b.linearVelocity.y).toBeGreaterThan(vy)
    b.queueFree()
    g.step()
    expect(g.tree.physics.bodyCount).toBe(0)
  })

  it('子类覆写 enterTree / exitTree 时不调用 super 也能正常注册', async () => {
    class Fruit extends RigidBody2D {
      entered = false
      override enterTree() {
        this.entered = true
      }
    }
    const g = await createTestGame({ main: Scene })
    const f = g.scene.add(new Fruit({ position: v(100, 100) }))
    f.add(new CollisionShape2D({ shape: circle(10) }))
    g.step(10)
    expect(f.entered).toBe(true)
    expect(f.y).toBeGreaterThan(100)
  })

  it('碰撞形状的偏移、增删会重建刚体形状；禁用的形状不参与碰撞', async () => {
    const g = await createTestGame({ main: Scene })
    g.scene.add(ground())
    const b = g.scene.add(new RigidBody2D({ position: v(375, 800), lockRotation: true }))
    const shape = b.add(new CollisionShape2D({ shape: rectangle(40, 40), position: v(0, 50) })) // 形状在刚体原点下方 50
    g.stepSeconds(3)
    // Box2D 多边形之间有约 0.01 米的皮肤间隙（这里 ≈ 0.5–1 像素）
    expect(Math.abs(b.y - (1000 - 50 - 20))).toBeLessThan(1.5)

    shape.disabled = true // 没有形状：穿过地面
    g.stepSeconds(1)
    expect(b.y).toBeGreaterThan(1000)
  })

  it('StaticBody2D 可以瞬移；dump 显示形状和速度', async () => {
    const g = await createTestGame({ main: Scene })
    const ground1 = g.scene.add(ground())
    const b = g.scene.add(ball(v(375, 900), 30))
    g.stepSeconds(2)
    ground1.position = v(375, 1250) // 地面下移 200
    g.stepSeconds(2)
    expect(b.y).toBeCloseTo(1200 - 30, 0)
    expect(g.dump()).toMatch(/CollisionShape2D \(CollisionShape2D\) position=\(0, 0\) shape=circle\(30\)/)
  })
})
