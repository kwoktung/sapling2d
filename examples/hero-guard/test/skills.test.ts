import { describe, expect, it } from 'vitest'
import { v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { HEROES } from '../src/data/heroes'
import { BRANCHES, GENERIC, HEADSHOT_MUL, isGeneric, xpToNext } from '../src/data/skills'
import { gameOptions } from '../src/game'
import { Archer } from '../src/nodes/Hero'
import { linePath } from '../src/path'
import type { Battle } from '../src/scenes/Battle'

async function manual() {
  const g = await createTestGame({ ...gameOptions, seed: 1 })
  const battle = g.scene as Battle
  battle.startWith('archer', 1)
  battle.stopSpawning()
  return { g, battle, archer: battle.heroes[0] as Archer }
}

/** 按 id 点技能（'archer.multishot.1'）；同一分支要从 1 级点起。 */
function learn(b: Battle, ...ids: string[]) {
  for (const id of ids) b.applySkill(BRANCHES.flatMap((br) => br.nodes).find((n) => n.id === id)!)
}

/** 几乎不动的怪：很长的竖直路线。 */
const dummy = (b: Battle, x: number, y: number, hp = 10000) => b.spawnEnemy('slime', linePath(x, y, y + 100000), hp)

const click = { pointerId: 0, position: v(0, 0), localPosition: v(0, 0) }

describe('经验和升级', () => {
  it('经验够了就升级：游戏暂停、弹出三选一（已上场英雄每条分支的第 1 级，或通用选项）；选完继续', async () => {
    const { g, battle } = await manual()
    battle.gainXp(xpToNext(1) + 3)
    expect([battle.level, battle.levelXp, battle.pendingLevels]).toEqual([2, 3, 1])
    g.step()
    expect(g.tree.paused).toBe(true)
    const offers = battle.picker!.offers
    expect(offers).toHaveLength(3)
    for (const o of offers) expect(isGeneric(o) || ['archer.multishot.1', 'archer.poison.1', 'archer.sniper.1'].includes(o.id)).toBe(true)
    g.step(10) // 暂停中界面照常（卡片弹出动画），游戏不动
    const card = battle.picker!.cards[1]!
    g.tap(card.x + 100, card.y + 100)
    expect(g.tree.paused).toBe(false)
    expect(battle.taken.map((n) => n.id)).toEqual([card.node.id])
    if (!isGeneric(card.node)) expect(battle.branchLevels.get(`archer.${card.node.branch}`)).toBe(1)
  })

  it('一次升好几级：依次弹出；分支点满后不再出现；全部点满后只剩通用选项', async () => {
    const { g, battle } = await manual()
    learn(battle, 'archer.multishot.1', 'archer.multishot.2', 'archer.multishot.3', 'archer.multishot.4')
    battle.gainXp(xpToNext(1) + xpToNext(2))
    expect(battle.pendingLevels).toBe(2)
    for (let n = 0; n < 2; n++) {
      g.step()
      expect(battle.picker!.offers.some((o) => !isGeneric(o) && o.branch === 'multishot')).toBe(false)
      battle.picker!.cards[0]!.clicked.emit(click)
    }
    expect(battle.pendingLevels).toBe(0)
    learn(battle, ...['sniper', 'poison'].flatMap((b) => [1, 2, 3, 4].map((l) => `archer.${b}.${l}`)).filter((id) => !battle.taken.some((t) => t.id === id)))
    battle.gainXp(xpToNext(battle.level) / battle.run.xpMul + 1)
    g.step()
    expect(battle.picker!.offers.every((o) => isGeneric(o))).toBe(true)
    void GENERIC
  })

  it('击杀加经验，升级界面上的经验条跟着变', async () => {
    const { g, battle } = await manual()
    for (let i = 0; i < 5; i++) dummy(battle, 375, 500 + i, 1)
    g.stepSeconds(4)
    expect(battle.xp).toBe(5)
    expect(battle.hud.level.text).toBe('Lv 1')
    expect(battle.hud.xpFill.scale.x).toBeCloseTo(5 / xpToNext(1))
  })
})

describe('弓手的技能', () => {
  it('多重箭：一次射 3 支，打 3 个不同的目标', async () => {
    const { g, battle, archer } = await manual()
    learn(battle, 'archer.multishot.1', 'archer.multishot.2')
    const es = [dummy(battle, 300, 500), dummy(battle, 375, 520), dummy(battle, 450, 540)]
    g.stepSeconds(0.6) // 一次攻击
    expect(archer.attacks).toBe(1)
    expect(es.map((e) => e.hp)).toEqual([9988, 9988, 9988])
  })

  it('多重箭 3 级：伤害 +25%；狙击 3 级：射程 +15%', async () => {
    const { battle, archer } = await manual()
    learn(battle, 'archer.multishot.1', 'archer.multishot.2', 'archer.multishot.3', 'archer.sniper.1', 'archer.sniper.2', 'archer.sniper.3')
    expect(archer.stats.damage).toBeCloseTo(HEROES.archer.damage * 1.25)
    expect(archer.stats.range).toBeCloseTo(HEROES.archer.range * 1.15)
  })

  it('暴击：按几率翻倍（2 级起 2.5 倍），飘字带感叹号', async () => {
    const { g, battle, archer } = await manual()
    learn(battle, 'archer.sniper.1', 'archer.sniper.2')
    archer.mods.critChance = 1
    const e = dummy(battle, 375, 500)
    g.stepSeconds(0.6)
    expect(e.hp).toBe(10000 - 12 * 2.5)
    expect(g.dump()).toContain('text=30!')
  })

  it('爆头：每第 5 箭 6 倍伤害', async () => {
    const { g, battle, archer } = await manual()
    learn(battle, 'archer.sniper.1', 'archer.sniper.2', 'archer.sniper.3', 'archer.sniper.4')
    archer.mods.critChance = 0
    const e = dummy(battle, 375, 500, 100000)
    while (archer.attacks < 5) g.step()
    g.stepSeconds(0.5)
    expect(e.hp).toBe(100000 - 12 * 4 - 12 * HEADSHOT_MUL)
  })

  it('毒箭：中毒每 0.5 秒跳一次，层数叠加到上限，时间到了解除', async () => {
    const { g, battle, archer } = await manual()
    learn(battle, 'archer.poison.1')
    const e = dummy(battle, 375, 500)
    while (archer.attacks < 1) g.step()
    g.stepSeconds(0.3) // 箭飞到
    expect(e.poisonStacks).toBe(1)
    archer.cooldown = 1e9 // 不再射
    const hp = e.hp
    g.stepSeconds(1.01)
    expect(hp - e.hp).toBeCloseTo(4 * 1, 0) // 1 层 × 每秒 4 × 1 秒
    battle.poison(e, 4, 3, 3, 5)
    expect(e.poisonStacks).toBe(3) // 上限 3 层
    g.stepSeconds(3.1)
    expect(e.poisonStacks).toBe(0)
  })

  it('毒雾：中毒的敌人死亡时，周围的敌人中毒', async () => {
    const { battle } = await manual()
    learn(battle, 'archer.poison.1', 'archer.poison.2', 'archer.poison.3', 'archer.poison.4')
    const a = dummy(battle, 200, 300, 1)
    const near = dummy(battle, 240, 320)
    const far = dummy(battle, 500, 300)
    battle.poison(a, 6, 3, 5, 1)
    battle.damage(a, 10)
    expect([near.poisonStacks, far.poisonStacks]).toEqual([2, 0])
  })

  it('穿透：箭沿出手方向直线飞，打中沿途所有敌人（每只一次）', async () => {
    const { g, battle, archer } = await manual()
    learn(battle, 'archer.multishot.1', 'archer.multishot.2', 'archer.multishot.3', 'archer.multishot.4')
    archer.mods.arrows = 1
    // 一列敌人在弓手正上方（弓手在 (375, 740)，从 (412, 690) 出手）
    const col = [dummy(battle, 380, 520), dummy(battle, 380, 450), dummy(battle, 380, 400)]
    col[0]!.dist = 0
    while (archer.attacks < 1) g.step()
    archer.cooldown = 1e9
    g.stepSeconds(0.6)
    expect(col.map((e) => e.hp < 10000)).toEqual([true, true, true])
    expect(col.map((e) => 10000 - e.hp)).toEqual([15, 15, 15]) // 伤害 12 × 1.25，每只只打一次
  })
})
