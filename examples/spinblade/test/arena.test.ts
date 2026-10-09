import { describe, expect, it } from 'vitest'
import { v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { FIGHTER, KNIFE, PLAYER, RING, TILE } from '../src/config'
import { Knife } from '../src/nodes/Knife'
import { gameOptions } from '../src/game'
import type { Arena } from '../src/scenes/Arena'

async function start() {
  const g = await createTestGame({ ...gameOptions, seed: 1 })
  return { g, arena: g.scene as Arena }
}

/** 把场地清空成只剩玩家：其他角色和地上的刀都不在附近，不干扰测试。 */
function isolate(arena: Arena) {
  arena.enemies.forEach((e, i) => {
    e.position = v(-2000 * (i + 1), -1000) // 彼此离开，刀圈不会互相碰到
    e.passive = true // 站着不动
  })
  for (const k of arena.groundKnives) k.position = v(-5000, -5000) // 和敌人分开放，否则会被敌人捡走
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

describe('场地', () => {
  it('从 Tiled 关卡创建：地板和墙、玩家、敌人、地上的刀', async () => {
    const { g, arena } = await start()
    expect(g.scene.children.slice(0, 2).map((n) => n.name)).toEqual(['Floor', 'Walls'])
    expect(arena.enemies).toHaveLength(5)
    expect(arena.groundKnives).toHaveLength(40)
    expect(arena.player.knives).toHaveLength(PLAYER.startKnives)
    expect(arena.enemies.map((e) => e.knives.length)).toEqual([4, 6, 5, 3, 4])
  })

  it('按住方向键移动，斜着走不更快', async () => {
    const { g, arena } = await start()
    isolate(arena)
    const p = arena.player
    const x0 = p.x
    g.keyDown('KeyD')
    g.stepSeconds(0.5)
    g.keyUp('KeyD')
    expect(p.x - x0).toBeCloseTo(PLAYER.speed * 0.5, 0)

    const start2 = p.position
    g.keyDown('KeyW')
    g.keyDown('KeyA')
    g.stepSeconds(0.5)
    expect(dist(p, start2)).toBeCloseTo(PLAYER.speed * 0.5, 0)
  })

  it('摇杆：在屏幕左半边拖动，玩家按推动方向移动；推得越远走得越快', async () => {
    const { g, arena } = await start()
    isolate(arena)
    const p = arena.player
    g.pointerDown(200, 1000)
    g.pointerMove(200, 910) // 向上推到底（半径 90）
    g.step()
    const y0 = p.y
    g.stepSeconds(0.5)
    expect(y0 - p.y).toBeCloseTo(PLAYER.speed * 0.5, 0)
    g.pointerMove(200, 1000 - 18 - 36) // 推到 60%：扣掉 20% 死区，力度 0.5
    g.step()
    const y1 = p.y
    g.stepSeconds(0.5)
    expect(y1 - p.y).toBeCloseTo(PLAYER.speed * 0.5 * 0.5, 0)
    g.pointerUp(200, 946)
    g.step()
    const y2 = p.y
    g.step(10)
    expect(p.y).toBe(y2)
  })

  it('被墙挡住：走进左边的墙，停在墙边', async () => {
    const { g, arena } = await start()
    isolate(arena)
    const p = arena.player
    p.position = v(400, 36.5 * TILE) // 出生点这一行左边有石头，往上一行
    g.keyDown('ArrowLeft')
    g.stepSeconds(5)
    expect(p.isOnWall).toBe(true)
    expect(p.x).toBeCloseTo(TILE + FIGHTER.box / 2) // 左边一列是墙
  })

  it('刀圈一直在转，刀都在刀圈上、刀尖朝外', async () => {
    const { g, arena } = await start()
    isolate(arena)
    const p = arena.player
    const k = p.knives[0]!
    const before = Math.atan2(k.y - p.y, k.x - p.x)
    g.stepSeconds(0.2)
    const after = Math.atan2(k.y - p.y, k.x - p.x)
    expect(after - before).toBeCloseTo(RING.spin * 0.2, 1)
    for (const knife of p.knives) {
      expect(dist(knife, p)).toBeCloseTo(p.ringRadius)
      const angle = Math.atan2(knife.y - p.y, knife.x - p.x)
      // 刀尖方向 (sin r, -cos r) 指向刀圈外
      expect(Math.cos(knife.rotation - Math.PI / 2 - angle)).toBeCloseTo(1)
    }
  })

  it('走到地上的刀上就捡起：刀数 +1，重新均匀分布；刀多了刀圈变大', async () => {
    const { g, arena } = await start()
    isolate(arena)
    const p = arena.player
    const knife = arena.groundKnives[0]!
    knife.position = v(p.x + 30, p.y)
    g.step(2)
    expect(knife.owner).toBe(p)
    expect(p.knives).toHaveLength(PLAYER.startKnives + 1)
    expect(arena.groundKnives).not.toContain(knife)
    expect(dist(knife, p)).toBeCloseTo(p.ringRadius)
    // 相邻两把刀的夹角都一样
    const n = p.knives.length
    const angles = p.knives.map((k) => Math.atan2(k.y - p.y, k.x - p.x))
    for (let i = 0; i < n; i++) {
      const gap = (angles[(i + 1) % n]! - angles[i]! + Math.PI * 4) % (Math.PI * 2)
      expect(gap).toBeCloseTo((Math.PI * 2) / n)
    }

    expect(p.ringRadius).toBe(RING.minRadius)
    for (const k of arena.groundKnives.slice(0, 30)) k.position = p.position
    g.step(2)
    expect(p.knives).toHaveLength(PLAYER.startKnives + 31)
    expect(p.ringRadius).toBeCloseTo((p.knives.length * RING.spacing) / (Math.PI * 2))
  })

  it('一把刀只会被一个角色捡起', async () => {
    const { g, arena } = await start()
    isolate(arena)
    const p = arena.player
    const e = arena.enemies[0]!
    e.position = v(p.x + 70, p.y)
    const knife = arena.groundKnives[0]!
    knife.position = v(p.x + 35, p.y)
    g.step(2)
    expect(p.knives.length + e.knives.length).toBe(PLAYER.startKnives + 4 + 1)
    expect([p.knives.includes(knife), e.knives.includes(knife)].filter(Boolean)).toHaveLength(1)
  })

  it('重叠的角色被推开，包括完全重合的', async () => {
    const { g, arena } = await start()
    isolate(arena)
    const p = arena.player
    const a = arena.enemies[0]!
    const b = arena.enemies[1]!
    a.position = v(p.x + 20, p.y)
    b.position = v(p.x - 300, p.y)
    const c = arena.enemies[2]!
    c.position = b.position
    g.stepSeconds(0.5)
    expect(dist(p, a)).toBeGreaterThan(FIGHTER.radius * 2 - 1)
    expect(dist(b, c)).toBeGreaterThan(FIGHTER.radius * 2 - 1)
  })

  it('被推的角色也会被墙挡住', async () => {
    const { g, arena } = await start()
    isolate(arena)
    const p = arena.player
    const e = arena.enemies[0]!
    const wallX = TILE + FIGHTER.box / 2 // 贴着左边的墙
    e.position = v(wallX, p.y)
    p.position = v(wallX + 30, p.y)
    g.keyDown('ArrowLeft') // 玩家一直往墙上挤
    g.stepSeconds(1)
    expect(e.x).toBeGreaterThanOrEqual(wallX - 1e-6)
    expect(p.x).toBeGreaterThan(e.x)
  })
})

/** 场上所有的刀：刀圈里的、地上的、飞着的。 */
function allKnives(arena: Arena) {
  return arena.children.filter((n) => n instanceof Knife)
}

describe('刀的碰撞', () => {
  it('刀碰刀：两把刀都被打飞，落地后在地上；刀的总数不变', async () => {
    const { g, arena } = await start()
    isolate(arena)
    const p = arena.player
    const e = arena.enemies[0]!
    const total = allKnives(arena).length
    // 刀圈有交叉、身体不重叠：两个刀圈反向转，刀一定会碰到
    e.position = v(p.x + p.ringRadius + e.ringRadius - 10, p.y)
    const before = p.knives.length + e.knives.length + arena.groundKnives.length
    g.step(10)
    const flying = allKnives(arena).filter((k) => k.flying)
    expect(flying.length).toBeGreaterThanOrEqual(2)
    expect(p.knives.length + e.knives.length + flying.length + arena.groundKnives.length).toBe(before)
    expect(p.knives.length).toBeLessThan(PLAYER.startKnives)
    expect(e.knives.length).toBeLessThan(4)
    g.stepSeconds(KNIFE.flyTime + 0.1)
    for (const k of flying) {
      expect(k.flying).toBe(false)
      expect(arena.isSolid(k.x, k.y)).toBe(false)
    }
    expect(allKnives(arena)).toHaveLength(total)
  })

  it('打飞的刀落地后可以被别人捡起', async () => {
    const { g, arena } = await start()
    isolate(arena)
    const p = arena.player
    const e = arena.enemies[0]!
    e.position = v(p.x + p.ringRadius + e.ringRadius - 10, p.y)
    g.step(10)
    g.stepSeconds(KNIFE.flyTime + 0.1)
    const landed = arena.groundKnives.find((k) => dist(k, p) < 400)!
    expect(landed).toBeDefined()
    const other = arena.enemies[1]!
    other.position = landed.position
    const n = other.knives.length
    g.step(2)
    expect(other.knives).toContain(landed)
    expect(other.knives).toHaveLength(n + 1)
  })

  it('刀砍身体扣血；同一把刀在冷却时间内不重复扣血', async () => {
    const { g, arena } = await start()
    isolate(arena)
    const p = arena.player
    const e = arena.enemies[0]!
    // 敌人没有刀，身体放在玩家的刀圈上
    for (const k of [...e.knives]) e.removeKnife(k)
    e.position = v(p.x + p.ringRadius, p.y)
    const steps = 60
    g.step(steps)
    const lost = e.maxHp - e.hp
    expect(lost).toBeGreaterThan(0)
    // 每把刀每 hitCooldown 秒最多砍一次
    expect(lost).toBeLessThanOrEqual(p.knives.length * (Math.floor(steps / 60 / KNIFE.hitCooldown) + 1))
  })

  it('靠墙时刀被打飞，不会落进墙里', async () => {
    const { g, arena } = await start()
    isolate(arena)
    const p = arena.player
    const e = arena.enemies[0]!
    // 两个角色贴着左边的墙上下排列，刀圈有交叉：有的刀会朝墙飞
    p.position = v(TILE + FIGHTER.box / 2, 20 * TILE)
    e.position = v(TILE + FIGHTER.box / 2, 20 * TILE + p.ringRadius + e.ringRadius - 10)
    g.stepSeconds(1)
    for (const k of allKnives(arena)) if (k.owner === null && dist(k, p) < 600) expect(arena.isSolid(k.x, k.y)).toBe(false)
  })
})
