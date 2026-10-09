import { describe, expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'
import { BOSS, PLAYER } from '../src/config'
import { gameOptions } from '../src/game'
import { BattleScene } from '../src/scenes/BattleScene'

class QuietBattle extends BattleScene {
  constructor() {
    super({ waves: false })
  }
}

class GodBattle extends BattleScene {
  constructor() {
    super({ godMode: true })
  }
}

async function quiet() {
  const g = await createTestGame({ ...gameOptions, main: QuietBattle, seed: 1 })
  return { g, scene: g.scene as BattleScene }
}

/** 让 Boss 飞到位，并关掉玩家射击以外的干扰。 */
function spawnSettledBoss(g: Awaited<ReturnType<typeof quiet>>['g'], scene: BattleScene) {
  const boss = scene.spawnBoss()
  g.stepSeconds(BOSS.enterSeconds + 0.1)
  expect(boss.entering).toBe(false)
  return boss
}

describe('Boss 出场', () => {
  it('到时间先出警告、停止普通出怪，然后 Boss 入场；HUD 显示血条', async () => {
    const g = await createTestGame({ ...gameOptions, main: GodBattle, seed: 3 })
    const scene = g.scene as BattleScene
    g.stepSeconds(BOSS.firstAt - 1)
    expect(scene.boss).toBeNull()
    g.stepSeconds(1.2)
    expect(scene.hud.warningVisible).toBe(true)
    const spawned = scene.spawned
    g.stepSeconds(BOSS.warningSeconds)
    expect(scene.boss).not.toBeNull()
    expect(scene.hud.warningVisible).toBe(false)
    expect(scene.hud.bossBarVisible).toBe(true)
    g.stepSeconds(5)
    expect(scene.spawned).toBe(spawned) // Boss 在场时不出普通敌机
  }, 30_000)
})

describe('Boss 战斗', () => {
  it('入场途中打不动；到位后受伤、血条跟着减少', async () => {
    const { g, scene } = await quiet()
    const boss = scene.spawnBoss()
    expect(boss.entering).toBe(true)
    expect(boss.hit(10)).toBe(false)
    expect(boss.hp).toBe(boss.maxHp)
    g.stepSeconds(BOSS.enterSeconds + 0.1)
    const before = boss.hp // 到位后的 0.1 秒里玩家的子弹已经在打它了
    expect(before).toBeLessThan(boss.maxHp)
    boss.hit(30)
    expect(boss.hp).toBe(before - 30)
    g.step()
    expect(scene.hud.bossBarRatio).toBeCloseTo(boss.hp / boss.maxHp)
  })

  it('随血量进入第二、第三阶段；每个阶段都会发射子弹', async () => {
    const { g, scene } = await quiet()
    scene.player.god = true
    const boss = spawnSettledBoss(g, scene)
    const firedIn = () => {
      const before = scene.enemyBulletsFired
      g.stepSeconds(2)
      return scene.enemyBulletsFired - before
    }
    expect(boss.phase).toBe(1)
    expect(firedIn()).toBeGreaterThan(0)
    boss.hit(Math.ceil(boss.maxHp * 0.45))
    expect(boss.phase).toBe(2)
    expect(firedIn()).toBeGreaterThan(10) // 螺旋：密集
    boss.hit(Math.ceil(boss.maxHp * 0.3))
    expect(boss.phase).toBe(3)
    expect(firedIn()).toBeGreaterThan(16) // 环形弹幕
  })

  it('撞到 Boss 掉命，Boss 不会被撞毁', async () => {
    const { g, scene } = await quiet()
    const boss = spawnSettledBoss(g, scene)
    scene.player.position = boss.position
    g.step()
    expect(scene.player.lives).toBe(PLAYER.lives - 1)
    expect(scene.boss).toBe(boss)
    expect(boss.dead).toBe(false)
  })

  it('击败 Boss：大量加分、连环爆炸、掉落道具，血条消失', async () => {
    const { g, scene } = await quiet()
    scene.player.god = true
    const boss = spawnSettledBoss(g, scene)
    scene.score = 0
    boss.hit(boss.hp - 1)
    for (let i = 0; i < 60 && !boss.dead; i++) g.step() // 最后一下由玩家的子弹打出
    expect(boss.dead).toBe(true)
    expect(scene.score).toBeGreaterThanOrEqual(BOSS.score)
    expect(scene.boss).toBeNull()
    expect(scene.hud.bossBarVisible).toBe(false)
    expect(scene.enemyBullets.every((b) => b.dead)).toBe(true) // 敌方子弹被清空
    expect(scene.powerUps.map((p) => p.kind).sort()).toEqual(['life', 'power', 'power'])
    g.stepSeconds(0.5)
    expect((g.dump().match(/Explosion/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })
})

describe('Boss 循环', () => {
  it('击败后恢复出怪；下一个 Boss 更晚出现、血更多', async () => {
    const g = await createTestGame({ ...gameOptions, main: GodBattle, seed: 5 })
    const scene = g.scene as BattleScene
    g.stepSeconds(BOSS.firstAt + BOSS.warningSeconds + 0.5)
    const first = scene.boss!
    g.stepSeconds(BOSS.enterSeconds)
    first.hit(first.hp - 1)
    for (let i = 0; i < 120 && !first.dead; i++) g.step()
    expect(first.dead).toBe(true)
    const spawned = scene.spawned
    g.stepSeconds(BOSS.resumeDelay + 2)
    expect(scene.spawned).toBeGreaterThan(spawned)
    g.stepSeconds(BOSS.interval + BOSS.warningSeconds)
    const second = scene.boss!
    expect(second).not.toBeNull()
    expect(second.maxHp).toBe(Math.round(first.maxHp * BOSS.hpGrowth))
  }, 60_000)
})
