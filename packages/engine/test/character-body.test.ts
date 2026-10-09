import { afterEach, describe, expect, it, vi } from 'vitest'
import { Area2D, CharacterBody2D, CollisionShape2D, key, Node2D, rectangle, RigidBody2D, Scene, StaticBody2D, TileMapLayer, tileset, v, type Vector2 } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

declare module 'sapling2d' {
  interface ActionRegistry {
    cbJump: true
  }
}

// 每格 16px；'#' 实心，'=' 单向平台，'.' 空
const TILES = tileset('cb-tiles.png', { tileSize: 16, tiles: { 1: { collision: 'solid' }, 2: { collision: 'oneWay' } } })
const ID: Record<string, number> = { '.': 0, '#': 1, '=': 2 }

function layer(rows: string[], options: { position?: Vector2; collisionLayer?: number } = {}): TileMapLayer {
  return new TileMapLayer({ tileSet: TILES, width: rows[0]!.length, height: rows.length, cells: rows.join('').split('').map((c) => ID[c]!), ...options })
}

/** 测试用角色：每个物理步按 `vx` / 重力设置速度，再 moveAndSlide。 */
class Body extends CharacterBody2D {
  vx = 0
  gravity = 0
  /** 每步开始时的速度覆盖（跳跃等）。 */
  vy: number | null = null
  frames: { floor: boolean; wall: boolean; ceiling: boolean }[] = []
  constructor(position: Vector2, w = 12, h = 16) {
    super({ name: 'Body', shape: rectangle(w, h), position })
  }
  override physicsProcess(dt: number) {
    const vy = this.vy ?? this.velocityY + this.gravity * dt
    this.vy = null
    this.setVelocity(this.vx, vy)
    this.moveAndSlide()
    this.frames.push({ floor: this.isOnFloor, wall: this.isOnWall, ceiling: this.isOnCeiling })
  }
}

/** `setup` 可以返回一个节点：角色加到它下面（默认加到场景）。 */
async function world(rows: string[], body: Body, setup?: (scene: Scene) => Node2D | void) {
  class Main extends Scene {
    static override assets = { tiles: TILES }
    override ready() {
      this.add(layer(rows))
      const host = setup?.(this) ?? this
      host.add(body)
    }
  }
  return createTestGame({ main: Main, actions: { cbJump: [key('Space')] } })
}

const LEVEL = [
  '..........', // 0
  '..........', // 1
  '..........', // 2
  '....#.....', // 3   砖块 (4, 3)
  '..........', // 4
  '..........', // 5
  '.......#..', // 6   墙 (7, 6..9)
  '.......#..', // 7
  '.......#..', // 8
  '.......#..', // 9
  '##########', // 10  地面顶面 y = 160
]

afterEach(() => vi.restoreAllMocks())

describe('CharacterBody2D 格子碰撞', () => {
  it('落地：脚底正好贴着地面，isOnFloor，y 方向速度清零', async () => {
    const b = new Body(v(40, 20))
    b.gravity = 900
    const g = await world(LEVEL, b)
    g.stepSeconds(2)
    expect(b.isOnFloor).toBe(true)
    expect(b.y + 8).toBeCloseTo(160, 9)
    expect(b.velocityY).toBe(0)
    expect(b.getSlideCollision(0)).toMatchObject({ cellY: 10, normal: v(0, -1) })
    expect(g.dump()).toContain('onFloor=true')
  })

  it('撞墙：x 停在墙边，velocity.x 清零，isOnWall，法线 (-1, 0)', async () => {
    const b = new Body(v(80, 152))
    b.gravity = 900
    b.vx = 120
    const g = await world(LEVEL, b)
    g.stepSeconds(1)
    expect(b.x + 6).toBeCloseTo(112, 9) // 墙在第 7 列：x = 112
    expect([b.isOnWall, b.isOnFloor, b.velocityX]).toEqual([true, true, 0])
    const c = b.getSlideCollision(0)
    expect([c.cellX, c.normal]).toEqual([7, v(-1, 0)])
    expect(b.getSlideCollision(1).normal).toEqual(v(0, -1)) // 同时站在地上
  })

  it('向左撞墙：法线 (1, 0)', async () => {
    const b = new Body(v(140, 152))
    b.gravity = 900
    b.vx = -200
    const g = await world(LEVEL, b)
    g.stepSeconds(1)
    expect(b.x - 6).toBeCloseTo(128, 9) // 墙的右边缘
    expect(b.getSlideCollision(0)).toMatchObject({ cellX: 7, normal: v(1, 0) })
  })

  it('每帧移动超过一格也不穿过地面', async () => {
    const b = new Body(v(40, 20))
    b.vy = 3000 // 每帧 50px > 3 格
    b.gravity = 0
    const g = await world(LEVEL, b)
    g.step(10)
    // 没有重力：落地那一步 isOnFloor，之后速度为 0、不再移动
    expect(b.frames.findIndex((f) => f.floor)).toBe(2) // 20 → 152 要 132px，每步 50px：第 3 步落地
    expect(b.y + 8).toBeCloseTo(160, 9)
  })

  it('顶砖块：isOnCeiling，碰撞的格子是砖块，法线 (0, 1)', async () => {
    const b = new Body(v(72, 152))
    b.gravity = 900
    const g = await world(LEVEL, b)
    g.step(5)
    b.vy = -400
    g.stepSeconds(1)
    const bump = b.frames.findIndex((f) => f.ceiling)
    expect(bump).toBeGreaterThan(5)
    expect(b.isOnFloor).toBe(true) // 撞到后落回地面
    // 重放到撞的那一帧：顶到时角色头顶贴着砖块底面 y = 64
    const b2 = new Body(v(72, 152))
    b2.gravity = 900
    const g2 = await world(LEVEL, b2)
    g2.step(5)
    b2.vy = -400
    g2.step(bump - 4)
    expect(b2.isOnCeiling).toBe(true)
    expect(b2.y - 8).toBeCloseTo(64, 9)
    expect(b2.getSlideCollision(0)).toMatchObject({ cellX: 4, cellY: 3, normal: v(0, 1) })
  })

  it('沿地面走过很多格不会被脚下的格子挡住；贴着墙下落也不会被墙挡住', async () => {
    const walker = new Body(v(10, 152))
    walker.gravity = 900
    walker.vx = 60
    const g = await world(['..........', '..........', '##########'].map((r) => r + r), walker) // 地面顶面 y = 32
    walker.y = 24
    g.stepSeconds(2)
    expect(walker.frames.some((f) => f.wall)).toBe(false)
    expect(walker.x).toBeCloseTo(10 + 120, 6)

    const slider = new Body(v(112 - 6, 40)) // 右边缘正好贴着第 7 列的墙
    slider.gravity = 900
    const g2 = await world(LEVEL, slider)
    g2.stepSeconds(1)
    expect(slider.frames.some((f) => f.wall)).toBe(false)
    expect(slider.isOnFloor).toBe(true)
  })

  it('单向平台：从下面跳上去能穿过，从上面落下来能站住，走路不被它挡住', async () => {
    const rows = ['..........', '..........', '..========', '..........', '..........', '##########'] // 平台顶面 y = 32，地面 y = 80
    const b = new Body(v(56, 72))
    b.gravity = 900
    const g = await world(rows, b)
    g.step(3)
    b.vy = -600
    g.stepSeconds(1.5)
    expect(b.isOnFloor).toBe(true)
    expect(b.y + 8).toBeCloseTo(32, 9) // 站在平台上
    b.vx = -40 // 走出平台左端（平台从第 2 列 x = 32 开始），掉回地面
    g.stepSeconds(1)
    b.vx = 0
    g.stepSeconds(1)
    expect(b.y + 8).toBeCloseTo(80, 9)
    expect(b.frames.some((f) => f.wall)).toBe(false)
  })

  it('collisionMask 过滤图层；图层和角色的父节点都平移后碰撞仍然正确', async () => {
    const b = new Body(v(40, 0))
    b.gravity = 900
    let parent!: Node2D
    const g = await world(['....'], b, (scene) => {
      // 第二层：只在碰撞层 2，角色默认 mask 1 → 不挡
      scene.add(layer(['....', '####'], { collisionLayer: 2, position: v(0, 40) }))
      // 第三层平移到 (30, 100)：地面顶面全局 y = 100 + 16 = 116
      const holder = scene.add(new Node2D({ position: v(10, 60) }))
      holder.add(layer(['....', '####'], { position: v(20, 40) }))
      parent = scene.add(new Node2D({ position: v(25, -30) }))
      return parent
    })
    b.x = 40 - 25
    g.stepSeconds(2)
    expect(b.isOnFloor).toBe(true)
    expect(b.y + 8 + parent.y).toBeCloseTo(116, 9)
    b.collisionMask = 2
    b.x = 40 - 25
    b.y = 0
    b.setVelocity(0, 0)
    g.stepSeconds(2)
    expect(b.y + 8 + parent.y).toBeCloseTo(40 + 16, 9)
  })

  it('速度很大或是 Infinity 也不会卡住：只扫地图范围内的格子', async () => {
    const b = new Body(v(40, 152))
    b.gravity = 900
    b.vx = 1e9
    const g = await world(LEVEL, b)
    g.step()
    expect(b.x + 6).toBeCloseTo(112, 9) // 仍然被墙挡住
    const free = new Body(v(40, -500)) // 在地图上方
    free.vx = Infinity
    const g2 = await world(LEVEL, free)
    g2.step()
    expect(free.x).toBe(Infinity)
  })

  it('碰撞盒不随角色自己的缩放变化（不报错）', async () => {
    const b = new Body(v(40, 20))
    b.gravity = 900
    b.scale = v(2, 2)
    const g = await world(LEVEL, b)
    g.stepSeconds(2)
    expect(b.y + 8).toBeCloseTo(160, 9)
  })

  it('图层旋转或缩放时报错', async () => {
    const b = new Body(v(40, 0))
    b.gravity = 900
    const g = await world(['....'], b, (scene) => {
      scene.add(layer(['####'], { position: v(0, 100) })).rotation = 0.1
    })
    expect(() => g.step()).toThrow(/rotated or scaled; tile collision only supports translation/)
  })

  it('在 physicsProcess 以外调用 moveAndSlide 报错', async () => {
    class Wrong extends CharacterBody2D {
      override process() {
        this.moveAndSlide()
      }
    }
    class Main extends Scene {
      override ready() {
        this.add(new Wrong({ shape: rectangle(8, 8) }))
      }
    }
    const g = await createTestGame({ main: Main })
    expect(() => g.step()).toThrow(/must be called from physicsProcess/)
  })

  it('形状必须是矩形；getSlideCollision 越界报错；结果对象复用', async () => {
    expect(() => new CharacterBody2D({ shape: { kind: 'circle' } as never })).toThrow(/must be rectangle/)
    const b = new Body(v(40, 20))
    b.gravity = 900
    const g = await world(LEVEL, b)
    g.stepSeconds(2)
    const c = b.getSlideCollision(0)
    g.step()
    expect(b.getSlideCollision(0)).toBe(c)
    expect(() => b.getSlideCollision(5)).toThrow(/out of range/)
  })

  it('和 StaticBody2D 重叠时提示一次（它挡不住角色）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const b = new Body(v(40, 0))
    b.gravity = 900
    const g = await world(LEVEL, b, (scene) => {
      const wall = scene.add(new StaticBody2D({ name: 'Box', position: v(40, 100) }))
      wall.add(new CollisionShape2D({ shape: rectangle(200, 200) }))
    })
    g.stepSeconds(3)
    const msgs = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('overlaps StaticBody2D'))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('"Box"')
  })
})

describe('physicsProcess 里的 isActionJustPressed', () => {
  it('120Hz：按下的那一帧没有物理步，下一个物理步里仍然为 true，而且只有一次', async () => {
    const seen: boolean[] = []
    class Main extends Scene {
      override physicsProcess() {
        seen.push(this.tree.input.isActionJustPressed('cbJump'))
      }
    }
    const g = await createTestGame({ main: Main, actions: { cbJump: [key('Space')] } })
    g.step() // 对齐：累加器归零
    seen.length = 0
    g.tree.advance(1 / 120) // 没有物理步
    g.keyDown('Space')
    g.tree.advance(1 / 120) // 处理按下，凑满一个物理步
    g.tree.advance(1 / 120)
    g.tree.advance(1 / 120)
    g.tree.advance(1 / 120)
    expect(seen).toEqual([true, false])
  })

  it('removeAction 清掉还没被物理步看到的按下', async () => {
    const seen: boolean[] = []
    class Main extends Scene {
      override physicsProcess() {
        seen.push(this.tree.input.isActionJustPressed('cbJump'))
      }
    }
    const g = await createTestGame({ main: Main, actions: { cbJump: [key('Space')] } })
    g.step()
    seen.length = 0
    g.keyDown('Space')
    g.tree.advance(1 / 120) // 处理按下，没有物理步
    g.tree.input.removeAction('cbJump')
    g.tree.input.addAction('cbJump', [key('KeyJ')])
    g.tree.advance(1 / 120)
    expect(seen).toEqual([false])
  })

  it('刚体的接触信号里也按物理步算', async () => {
    const seen: boolean[] = []
    class Main extends Scene {
      override ready() {
        const area = this.add(new Area2D({ position: v(100, 100) }))
        area.add(new CollisionShape2D({ shape: rectangle(400, 400) }))
        area.bodyEntered.connect(() => seen.push(this.tree.input.isActionJustPressed('cbJump')))
        const ball = this.add(new RigidBody2D({ position: v(100, 100) }))
        ball.add(new CollisionShape2D({ shape: rectangle(10, 10) }))
      }
    }
    const g = await createTestGame({ main: Main, actions: { cbJump: [key('Space')] } })
    g.keyDown('Space')
    g.tree.advance(1 / 120) // 处理按下，没有物理步
    g.tree.advance(1 / 120) // 第一个物理步：刚体创建并进入区域
    g.tree.advance(1 / 60)
    expect(seen[0]).toBe(true)
  })
})
