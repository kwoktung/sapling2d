import { describe, expect, it } from 'vitest'
import { v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { ENEMY_FEEL } from '../src/config'
import { gameOptions } from '../src/game'
import { linePath } from '../src/path'
import type { Battle } from '../src/scenes/Battle'

async function setup() {
  const g = await createTestGame({ ...gameOptions, seed: 8 })
  const battle = g.scene as Battle
  return { g, battle }
}

describe('走路动画', () => {
  it('有脚的怪（骷髅）：按走过的距离换帧，停下（眩晕）回到第 1 帧；不弹跳', async () => {
    const { g, battle } = await setup()
    battle.startWith('archer', v(80, 1000))
    battle.stopSpawning()
    battle.heroes[0]!.cooldown = 1e9
    const e = battle.spawnEnemy('skeleton', linePath(600, 0, 100000), 1e6)
    expect(e.walker?.frameCount).toBe(4)
    const frames = new Set<number>()
    let maxY = 0
    for (let i = 0; i < 90; i++) {
      g.step()
      frames.add(e.walker!.frame)
      maxY = Math.max(maxY, -e.body.y)
    }
    expect([...frames].sort()).toEqual([0, 1, 2, 3])
    expect(maxY).toBeLessThanOrEqual(ENEMY_FEEL.walkBob + 0.01) // 只是轻颠，不是弹跳
    // 1.5 秒走了 75 像素：每 walkStep 像素一帧
    expect(e.dist).toBeCloseTo(75, 0)
    e.stunLeft = 10
    g.step(2)
    expect([e.walker!.frame, e.body.y]).toEqual([0, 0])
  })

  it('没有走路帧的怪（史莱姆）照旧弹跳', async () => {
    const { g, battle } = await setup()
    battle.startWith('archer', v(80, 1000))
    battle.stopSpawning()
    battle.heroes[0]!.cooldown = 1e9
    const e = battle.spawnEnemy('slime', linePath(600, 0, 100000), 1e6)
    expect(e.walker).toBe(null)
    let maxY = 0
    for (let i = 0; i < 60; i++) {
      g.step()
      maxY = Math.max(maxY, -e.body.y)
    }
    expect(maxY).toBeGreaterThan(ENEMY_FEEL.hopHeight * 0.8)
  })

  it('英雄：走位时换帧，站着时第 1 帧', async () => {
    const { g, battle } = await setup()
    const archer = battle.startWith('archer')
    battle.stopSpawning()
    expect(archer.body.frameCount).toBe(4)
    expect(archer.body.frame).toBe(0)
    const e = battle.spawnEnemy('slime', linePath(650, 100, 100000), 1e6)
    e.stunLeft = 1e9 // 站着不动：弓手往它挪（射程外）
    const frames = new Set<number>()
    for (let i = 0; i < 60; i++) {
      g.step()
      frames.add(archer.body.frame)
    }
    expect(frames.size).toBeGreaterThan(2)
    battle.damage(e, 1e9)
    g.stepSeconds(6) // 走回待命点，停下
    expect(archer.body.frame).toBe(0)
  })

  it('英雄不会每帧追着慢慢移动的目标挪小碎步（起步有死区）：开局 20 秒里“走 / 停”切换很少', async () => {
    for (const seed of [1, 4]) {
      const g = await createTestGame({ ...gameOptions, seed })
      const b = g.scene as Battle
      b.startWith('archer')
      b.placeHero('mage')
      let toggles = 0
      const last = new Map<unknown, string>()
      for (let i = 0; i < 60 * 20; i++) {
        g.step()
        for (const h of b.heroes) {
          const key = `${h.x.toFixed(2)},${h.y.toFixed(2)}`
          const moved = last.get(h) !== key
          const was = last.get(`${h.kind}-moving`) === '1'
          if (i > 0 && moved !== was) toggles++
          last.set(h, key)
          last.set(`${h.kind}-moving`, moved ? '1' : '0')
        }
      }
      // 修之前每 20 秒 300–500 次（每秒十几次：看起来在抖）
      expect(toggles).toBeLessThan(60)
    }
  })
})
