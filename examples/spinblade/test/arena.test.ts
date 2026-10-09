import { describe, expect, it } from 'vitest'
import { v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { FIGHTER, PLAYER, RING, TILE } from '../src/config'
import { gameOptions } from '../src/game'
import type { Arena } from '../src/scenes/Arena'

async function start() {
  const g = await createTestGame({ ...gameOptions, seed: 1 })
  return { g, arena: g.scene as Arena }
}

/** 把场地清空成只剩玩家：其他角色和地上的刀都不在附近，不干扰测试。 */
function isolate(arena: Arena) {
  for (const e of arena.enemies) e.position = v(-1000, -1000)
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
