import { describe, expect, it } from 'vitest'
import {
  Area2D,
  circle,
  CollisionShape2D,
  ConvexPolygonShape2D,
  Node2D,
  polygon,
  rectangle,
  RigidBody2D,
  Scene,
  StaticBody2D,
  v,
  type PhysicsBody2D,
  type Vector2,
} from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

function ball(position: Vector2, radius = 20, opts: ConstructorParameters<typeof RigidBody2D>[0] = {}) {
  const b = new RigidBody2D({ position, ...opts })
  b.add(new CollisionShape2D({ shape: circle(radius) }))
  return b
}

/** 地面上表面在 y = 1000 */
function ground(opts: ConstructorParameters<typeof StaticBody2D>[0] = {}) {
  const g = new StaticBody2D({ name: 'Ground', position: v(375, 1050), ...opts })
  g.add(new CollisionShape2D({ shape: rectangle(2000, 100) }))
  return g
}

/** 记录信号：`entered:Name` / `exited:Name` */
function record(obj: { bodyEntered: { connect(fn: (b: PhysicsBody2D) => void): unknown }; bodyExited: { connect(fn: (b: PhysicsBody2D) => void): unknown } }) {
  const log: string[] = []
  obj.bodyEntered.connect((b) => log.push(`entered:${b.name}`))
  obj.bodyExited.connect((b) => log.push(`exited:${b.name}`))
  return log
}

describe('刚体接触信号', () => {
  it('接触开始时双方都收到 bodyEntered，分开时收到 bodyExited；getCollidingBodies 反映当前接触', async () => {
    const g = await createTestGame({ main: Scene })
    const floor = g.scene.add(ground())
    const b = g.scene.add(ball(v(375, 900), 30, { name: 'Ball' }))
    const floorLog = record(floor)
    const ballLog = record(b)
    g.stepSeconds(1)
    expect(floorLog).toEqual(['entered:Ball'])
    expect(ballLog).toEqual(['entered:Ground'])
    expect(floor.getCollidingBodies()).toEqual([b])

    b.position = v(375, 200) // 瞬移离开地面
    g.step(2)
    expect(floorLog).toEqual(['entered:Ball', 'exited:Ball'])
    expect(ballLog).toEqual(['entered:Ground', 'exited:Ground'])
  })

  it('对方被销毁时收到 bodyExited（参数是已销毁的节点）', async () => {
    const g = await createTestGame({ main: Scene })
    const floor = g.scene.add(ground())
    const b = g.scene.add(ball(v(375, 960), 30, { name: 'Ball' }))
    const exited: PhysicsBody2D[] = []
    floor.bodyExited.connect((x) => exited.push(x))
    g.stepSeconds(1)
    b.queueFree()
    g.step(2)
    expect(exited).toEqual([b])
    expect(exited[0]!.isFreed).toBe(true)
  })

  it('在 bodyEntered 回调里销毁两个刚体并生成新刚体（合成玩法）：安全，新刚体正常参与模拟', async () => {
    class Fruit extends RigidBody2D {
      constructor(
        position: Vector2,
        readonly level: number,
      ) {
        super({ position, name: `Fruit${level}` })
        this.add(new CollisionShape2D({ shape: circle(20 + level * 10) }))
      }
      override ready() {
        this.bodyEntered.connect((other) => {
          if (!(other instanceof Fruit) || other.level !== this.level || this.isQueuedForDeletion || other.isQueuedForDeletion) return
          const mid = this.position.lerp(other.position, 0.5)
          this.queueFree()
          other.queueFree()
          this.parent!.add(new Fruit(mid, this.level + 1)) // 物理回调里直接 add：下一个物理步才创建刚体
        }, this)
      }
    }
    const g = await createTestGame({ main: Scene })
    g.scene.add(ground())
    g.scene.add(new Fruit(v(375, 900), 1))
    g.scene.add(new Fruit(v(380, 700), 1))
    g.stepSeconds(3)
    const fruits = g.scene.children.filter((c): c is Fruit => c instanceof Fruit)
    expect(fruits.map((f) => f.level)).toEqual([2])
    expect(fruits[0]!.y).toBeCloseTo(1000 - 40, 0) // 合成后的大水果落在地面上
    expect(g.tree.physics.bodyCount).toBe(2)
  })

  it('在回调里立即 remove() 刚体也是安全的', async () => {
    const g = await createTestGame({ main: Scene })
    const floor = g.scene.add(ground())
    const b = g.scene.add(ball(v(375, 960), 30))
    floor.bodyEntered.connect((x) => x.parent?.remove(x))
    g.stepSeconds(1)
    expect(b.isInsideTree).toBe(false)
    expect(g.tree.physics.bodyCount).toBe(1)
  })
})

describe('Area2D', () => {
  it('刚体穿过区域：entered 然后 exited；区域不影响刚体运动；刚体自己不会收到区域的信号', async () => {
    const g = await createTestGame({ main: Scene })
    const area = g.scene.add(new Area2D({ name: 'Zone', position: v(375, 500) }))
    area.add(new CollisionShape2D({ shape: rectangle(400, 100) }))
    const b = g.scene.add(ball(v(375, 300), 20, { name: 'Ball' }))
    const areaLog = record(area)
    const ballLog = record(b)

    let overlappedAt = -1
    for (let i = 0; i < 90 && overlappedAt < 0; i++) {
      g.step()
      if (area.overlapsBody(b)) overlappedAt = g.tree.physicsFrames
    }
    expect(overlappedAt).toBeGreaterThan(0)
    expect(area.getOverlappingBodies()).toEqual([b])
    g.stepSeconds(1)
    expect(areaLog).toEqual(['entered:Ball', 'exited:Ball'])
    expect(ballLog).toEqual([])
    expect(b.y).toBeGreaterThan(600) // 直接穿过
  })

  it('区域跟随祖先的移动', async () => {
    const g = await createTestGame({ main: Scene, physics: { gravity: v(0, 0) } })
    const carrier = g.scene.add(new Node2D({ position: v(100, 100) }))
    const area = carrier.add(new Area2D())
    area.add(new CollisionShape2D({ shape: circle(30) }))
    const b = g.scene.add(ball(v(600, 600), 10, { name: 'Target' }))
    const log = record(area)
    g.step(2)
    expect(log).toEqual([])
    carrier.position = v(600, 600) // 只移动了祖先
    g.step(2)
    expect(log).toEqual(['entered:Target'])
    expect(b.linearVelocity.length()).toBe(0)
  })

  it('静态刚体不会被区域检测到', async () => {
    const g = await createTestGame({ main: Scene })
    const area = g.scene.add(new Area2D({ position: v(375, 1000) }))
    area.add(new CollisionShape2D({ shape: rectangle(100, 100) }))
    g.scene.add(ground())
    g.step(5)
    expect(area.getOverlappingBodies()).toEqual([])
  })
})

describe('碰撞层', () => {
  async function pair(a: { layer: number; mask: number }, b: { layer: number; mask: number }) {
    const g = await createTestGame({ main: Scene })
    g.scene.add(ground({ collisionLayer: a.layer, collisionMask: a.mask }))
    const x = g.scene.add(ball(v(375, 900), 30, { collisionLayer: b.layer, collisionMask: b.mask }))
    g.stepSeconds(1.5)
    return x.y < 1000 // 是否被地面挡住
  }

  it('Godot 规则：任一方的 mask 包含对方的 layer 就会碰撞', async () => {
    expect(await pair({ layer: 1, mask: 1 }, { layer: 1, mask: 1 })).toBe(true)
    expect(await pair({ layer: 1, mask: 0 }, { layer: 2, mask: 1 })).toBe(true) // 球扫描地面所在层
    expect(await pair({ layer: 1, mask: 2 }, { layer: 2, mask: 0 })).toBe(true) // 地面扫描球所在层
    expect(await pair({ layer: 1, mask: 1 }, { layer: 2, mask: 2 })).toBe(false) // 互不扫描：穿过
  })

  it('支持全部 32 层（第 32 层是符号位）', async () => {
    const top = (1 << 31) >>> 0
    expect(await pair({ layer: top, mask: 0 }, { layer: 0, mask: top })).toBe(true)
    const b = new RigidBody2D()
    b.setCollisionLayerValue(32, true)
    b.setCollisionLayerValue(1, false)
    expect(b.collisionLayer).toBe(top)
    expect(b.getCollisionLayerValue(32)).toBe(true)
    expect(() => b.setCollisionLayerValue(33, true)).toThrow(/1\.\.32/)
  })

  it('运行时修改碰撞层立即生效', async () => {
    const g = await createTestGame({ main: Scene })
    g.scene.add(ground())
    const b = g.scene.add(ball(v(375, 900), 30))
    g.stepSeconds(1)
    expect(b.y).toBeCloseTo(970, 0)
    b.collisionLayer = 2
    b.collisionMask = 2
    g.stepSeconds(1)
    expect(b.y).toBeGreaterThan(1000)
  })
})

describe('ConvexPolygonShape2D', () => {
  it('取凸包，顶点乱序和凹点都可以；面积正确', () => {
    const p = polygon([v(0, 0), v(100, 0), v(50, 20), v(100, 100), v(0, 100)]) // (50,20) 是凹点
    expect(p.points).toHaveLength(4)
    expect(p.area).toBeCloseTo(10000)
  })

  it('点数不足或超过上限时报错', () => {
    expect(() => polygon([v(0, 0), v(1, 1), v(2, 2)])).toThrow(/at least 3/)
    const many = Array.from({ length: 13 }, (_, i) => v(Math.cos((i / 13) * Math.PI * 2) * 50, Math.sin((i / 13) * Math.PI * 2) * 50))
    expect(() => new ConvexPolygonShape2D(many)).toThrow(/at most 12/)
  })

  it('三角形刚体落在地面上，形状偏移和旋转生效', async () => {
    const g = await createTestGame({ main: Scene })
    g.scene.add(ground())
    const b = g.scene.add(new RigidBody2D({ position: v(375, 800), lockRotation: true }))
    // 底边宽 80、高 60 的三角形，形状整体下移 20
    b.add(new CollisionShape2D({ shape: polygon([v(-40, 30), v(40, 30), v(0, -30)]), position: v(0, 20) }))
    g.stepSeconds(3)
    expect(Math.abs(b.y - (1000 - 30 - 20))).toBeLessThan(1.5)
  })
})
