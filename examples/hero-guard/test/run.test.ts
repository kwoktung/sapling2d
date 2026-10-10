import { describe, expect, it } from 'vitest'
import { RandomNumberGenerator } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { START, ULT } from '../src/config'
import { HEROES } from '../src/data/heroes'
import { availableNodes, BRANCHES, drawOffers, GENERIC, GENERIC_WEIGHT, isGeneric } from '../src/data/skills'
import { gameOptions } from '../src/game'
import { buildSummary } from '../src/nodes/ResultPanel'
import { linePath } from '../src/path'
import type { Battle } from '../src/scenes/Battle'

const generic = (id: string) => GENERIC.find((g) => g.id === `generic.${id}`)!
const node = (id: string) => BRANCHES.flatMap((b) => b.nodes).find((n) => n.id === id)!

async function setup(storage?: Record<string, number>) {
  const g = await createTestGame({ ...gameOptions, seed: 8, ...(storage ? { storage } : {}) })
  const battle = g.scene as Battle
  battle.startWith('archer', 1)
  battle.stopSpawning()
  return { g, battle }
}

describe('通用选项', () => {
  it('全体攻速 / 伤害：已经上场和之后上场的英雄都吃到；可以叠加', async () => {
    const { battle } = await setup()
    battle.applyGeneric(generic('attackSpeed'))
    battle.applyGeneric(generic('damage'))
    battle.applyGeneric(generic('damage'))
    const archer = battle.heroes[0]!
    expect(archer.stats.interval).toBeCloseTo(HEROES.archer.interval / 1.1)
    expect(archer.stats.damage).toBeCloseTo(HEROES.archer.damage * 1.2)
    const mage = battle.placeHero('mage', battle.slots[3]!)
    expect(mage.stats.damage).toBeCloseTo(HEROES.mage.damage * 1.2)
    battle.applySkill(node('archer.multishot.1'))
    battle.applySkill(node('archer.multishot.2'))
    battle.applySkill(node('archer.multishot.3'))
    expect(archer.stats.damage).toBeCloseTo(HEROES.archer.damage * 1.25 * 1.2) // 技能和通用相乘
  })

  it('回复 3 条命；大招充能 +25%；经验 +20%', async () => {
    const { battle } = await setup()
    battle.lives = 10
    battle.applyGeneric(generic('lives'))
    expect(battle.lives).toBe(13)
    battle.applyGeneric(generic('ultCharge'))
    battle.chargeUlt('archer', 40)
    expect(battle.energy.archer).toBeCloseTo((40 / ULT.damagePerEnergy) * 1.25)
    battle.applyGeneric(generic('xp'))
    battle.gainXp(10)
    expect(battle.xp).toBeCloseTo(12)
  })

  it('抽卡：技能节点权重 1、通用选项权重低；通用选项选过之后还会出现', async () => {
    const rng = new RandomNumberGenerator(1)
    const nodes = availableNodes(new Set(['archer']), new Map())
    let genericPicks = 0
    let total = 0
    for (let i = 0; i < 2000; i++) {
      const first = drawOffers(nodes, 1, () => rng.randf())[0]!
      total++
      if (isGeneric(first)) genericPicks++
    }
    // 3 个节点 × 1 + 5 个通用 × 0.35：第一张是通用的概率 = 1.75 / 4.75
    expect(genericPicks / total).toBeCloseTo((5 * GENERIC_WEIGHT) / (3 + 5 * GENERIC_WEIGHT), 1)
    const { battle } = await setup()
    battle.applyGeneric(generic('lives'))
    const offers = drawOffers([], 5, () => rng.randf())
    expect(offers.map((o) => o.id).sort()).toEqual(GENERIC.map((g) => g.id).sort())
    void battle
  })
})

describe('结束画面', () => {
  it('构筑回顾：每个英雄点过的分支和最高等级（第 4 级写“质变”），通用选项各几次', () => {
    const lines = buildSummary([
      node('archer.multishot.1'),
      node('archer.multishot.2'),
      node('archer.poison.1'),
      node('archer.poison.2'),
      node('archer.poison.3'),
      node('archer.poison.4'),
      node('mage.frost.1'),
      generic('damage'),
      generic('damage'),
      generic('lives'),
    ])
    expect(lines).toEqual(['弓手：多重箭 Lv2　毒箭 质变', '法师：寒冰 Lv1', '通用：锋芒×2　城墙修补'])
    expect(buildSummary([])).toEqual(['（这一局没有点技能）'])
  })

  it('失败时弹出：波次、击杀、用时、构筑；存最高波次和胜利次数；按空格重开', async () => {
    const { g, battle } = await setup({ bestWave: 7, wins: 2 })
    battle.wave = 9
    battle.state = 'wave'
    battle.kills = 33
    battle.applySkill(node('archer.sniper.1'))
    g.stepSeconds(2)
    battle.lives = 1
    battle.spawnEnemy('slime', linePath(300, 1125, 1200), 1e6)
    g.stepSeconds(2)
    expect(battle.state).toBe('lost')
    const r = battle.result!.result
    expect([r.won, r.wave, r.kills, r.bestWave, r.wins]).toEqual([false, 9, 33, 9, 2])
    expect(r.time).toBeGreaterThan(3)
    expect(battle.result!.lines).toEqual(['弓手：狙击 Lv1'])
    expect([g.tree.storage.get('bestWave', 0), g.tree.storage.get('wins', 0)]).toEqual([9, 2])
    g.pressKey('Space')
    for (let i = 0; i < 20 && g.scene === battle; i++) await new Promise((res) => setTimeout(res, 0))
    expect((g.scene as Battle).lives).toBe(START.lives)
  })

  it('胜利时胜利次数 +1；最高波次不会变低', async () => {
    const { g, battle } = await setup({ bestWave: 20, wins: 2 })
    battle.wave = 20
    battle.state = 'won'
    g.step()
    expect([battle.result!.result.won, g.tree.storage.get('wins', 0), g.tree.storage.get('bestWave', 0)]).toEqual([true, 3, 20])
  })
})
