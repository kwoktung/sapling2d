import { describe, expect, it } from 'vitest'
import { v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { ENEMIES } from '../src/data/enemies'
import { HEROES } from '../src/data/heroes'
import { BRANCHES, BURN_DPS, FREEZE_TIME } from '../src/data/skills'
import { gameOptions } from '../src/game'
import { Mage } from '../src/nodes/Hero'
import { linePath } from '../src/path'
import type { Battle } from '../src/scenes/Battle'

const click = { pointerId: 0, position: v(0, 0), localPosition: v(0, 0) }

function learn(b: Battle, ...ids: string[]) {
  for (const id of ids) b.applySkill(BRANCHES.flatMap((br) => br.nodes).find((n) => n.id === id)!)
}

const dummy = (b: Battle, x: number, y: number, hp = 10000) => b.spawnEnemy('slime', linePath(x, y, y + 100000), hp)

/** 法师放在 1 号槽位（上排中间，(375, 740)），手动模式。 */
async function withMage() {
  const g = await createTestGame({ ...gameOptions, seed: 2 })
  const battle = g.scene as Battle
  const mage = battle.startWith('mage', 1) as Mage
  battle.stopSpawning()
  return { g, battle, mage }
}

describe('选英雄和解锁', () => {
  it('开局弹出 3 张英雄卡（骑士敬请期待）；点卡片再点空槽位放下，然后开始第 1 波', async () => {
    const g = await createTestGame({ ...gameOptions, seed: 1 })
    const battle = g.scene as Battle
    g.step(30)
    expect(battle.state).toBe('choosing')
    const cards = battle.heroPicker!.cards
    expect(cards.map((c) => [c.kind, c.enabled])).toEqual([
      ['archer', true],
      ['mage', true],
      ['knight', false],
    ])
    g.tap(cards[1]!.x + 300, cards[1]!.y + 100) // 法师
    expect([battle.state, battle.placing]).toEqual(['placing', 'mage'])
    expect(battle.slots.every((s) => s.inputPickable)).toBe(true)
    const s4 = battle.slots[4]!
    g.tap(s4.x, s4.y)
    expect(battle.slotOf(battle.heroes[0]!)).toBe(s4)
    expect(battle.heroes[0]).toBeInstanceOf(Mage)
    g.stepSeconds(1.2)
    expect([battle.state, battle.wave]).toEqual(['wave', 1])
  })

  it('第 3 波前从剩下的英雄里再选一个；第 6 波只剩没实现的骑士时不弹', async () => {
    const g = await createTestGame({ ...gameOptions, seed: 1 })
    const battle = g.scene as Battle
    battle.startWith('archer', 1)
    // 直接跳到第 2 波打完
    battle.wave = 2
    battle.state = 'gap'
    g.stepSeconds(1)
    expect(battle.state).toBe('choosing')
    expect(battle.heroPicker!.cards.map((c) => c.kind)).toEqual(['mage', 'knight'])
    battle.heroPicker!.cards[0]!.clicked.emit(click)
    battle.slots[3]!.clicked.emit(click)
    g.stepSeconds(1)
    expect([battle.heroes.map((h) => h.kind), battle.wave]).toEqual([['archer', 'mage'], 3])
    battle.stopSpawning()
    battle.manual = false
    for (const e of battle.enemies) e.queueFree()
    battle.wave = 5
    battle.state = 'gap'
    g.step(2)
    g.stepSeconds(2.5)
    expect([battle.heroPicker, battle.wave]).toEqual([null, 6])
  })

  it('三选一只出已上场英雄的技能', async () => {
    const { g, battle } = await withMage()
    battle.gainXp(100)
    g.step()
    expect(battle.picker!.offers.every((o) => o.hero === 'mage')).toBe(true)
  })
})

describe('法师', () => {
  it('火球落地范围伤害（半径 70）', async () => {
    const { g, battle } = await withMage()
    const a = dummy(battle, 375, 520)
    const b = dummy(battle, 420, 530) // 离 a 约 46
    const c = dummy(battle, 560, 520) // 离 a 185
    g.stepSeconds(1.2)
    expect([a.hp, b.hp, c.hp]).toEqual([10000 - HEROES.mage.damage, 10000 - HEROES.mage.damage, 10000])
  })

  it('烈焰：伤害 +25% ×2、半径 +30%；质变留下燃烧地面', async () => {
    const { g, battle, mage } = await withMage()
    learn(battle, 'mage.fire.1', 'mage.fire.2', 'mage.fire.3', 'mage.fire.4')
    expect(mage.stats.damage).toBeCloseTo(18 * 1.25 * 1.25)
    expect(mage.blastRadius).toBeCloseTo(70 * 1.3)
    const e = dummy(battle, 375, 520)
    while (mage.attacks < 1) g.step()
    mage.cooldown = 1e9
    g.stepSeconds(0.6) // 火球飞到
    expect(battle.burns).toHaveLength(1)
    const hp = e.hp
    g.stepSeconds(1.01)
    expect(hp - e.hp).toBeCloseTo(BURN_DPS, 0) // 燃烧 1 秒
    g.stepSeconds(1.5)
    expect(battle.burns).toHaveLength(0)
  })

  it('寒冰：减速；时间到恢复；质变 2 秒内被打 3 次冰冻', async () => {
    const { g, battle, mage } = await withMage()
    learn(battle, 'mage.frost.1')
    const e = battle.spawnEnemy('slime', linePath(375, 500, 3000), 10000)
    while (mage.attacks < 1) g.step()
    mage.cooldown = 1e9
    g.stepSeconds(0.6)
    expect(e.speed).toBeCloseTo(ENEMIES.slime.speed * 0.7)
    g.stepSeconds(1.6)
    expect(e.speed).toBe(ENEMIES.slime.speed)
    learn(battle, 'mage.frost.2', 'mage.frost.3', 'mage.frost.4')
    mage.cooldown = 0
    mage.stats.interval = 0.5 // 2 秒内打 3 次
    while (e.frozenLeft === 0 && battle.tree.time < 20) g.step()
    expect(e.frozenLeft).toBeGreaterThan(FREEZE_TIME - 0.1)
    expect(e.speed).toBe(0)
  })

  it('雷电：每第 3 次攻击放连锁闪电，跳 2 次，每跳 60%', async () => {
    const { g, battle, mage } = await withMage()
    learn(battle, 'mage.lightning.1')
    const es = [dummy(battle, 375, 520), dummy(battle, 470, 520), dummy(battle, 570, 520), dummy(battle, 670, 520)]
    mage.stats.interval = 0.4
    while (mage.casts < 3) g.step()
    mage.cooldown = 1e9
    g.stepSeconds(0.8)
    // 第 3 次：闪电先打目标（18），再跳到最近的两个（10.8、6.48）；火球另外打目标 3 次
    const lightning = es.map((e) => 10000 - e.hp)
    expect(lightning[0]).toBeCloseTo(18 * 3 + 18, 1)
    expect(lightning[1]).toBeCloseTo(18 * 0.6, 1)
    expect(lightning[2]).toBeCloseTo(18 * 0.36, 1)
    expect(lightning[3]).toBe(0) // 只跳 2 次
  })
})
