import { describe, expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'
import { START, WAVE } from '../src/config'
import { gameOptions } from '../src/game'
import { Hero } from '../src/nodes/Hero'
import { linePath } from '../src/path'
import { Battle } from '../src/scenes/Battle'
import { ATTACK, baseStats } from '../src/skills'

async function start() {
  const g = await createTestGame({ ...gameOptions, seed: 1 })
  const battle = g.scene as Battle
  battle.stopSpawning() // 测试自己放怪
  return { g, battle }
}

/** 第一排、第二列的槽位（x = 300, y = 430）。 */
const slotAt = (b: Battle, x: number, y: number) => b.slots.find((s) => s.x === x && s.y === y)!

/** 一只站着不动的怪（速度 0），放在 (x, y)。 */
function dummy(b: Battle, x: number, y: number, hp = 1000) {
  const e = b.spawnEnemy(linePath(x, y, y + 2000), hp, 0)
  return e
}

const settle = () => new Promise((r) => setTimeout(r, 0))


describe('放英雄', () => {
  it('点槽位放下选中的英雄，扣金币；同一槽位不能再放；钱不够时不放', async () => {
    const { g, battle } = await start()
    g.tap(300, 430) // 默认选中弓手
    expect(battle.heroes.map((h) => h.kind)).toEqual(['archer'])
    expect(battle.gold).toBe(START.gold - baseStats().archer.cost)
    g.tap(300, 430)
    expect(battle.heroes).toHaveLength(1)
    battle.hud.select('mage')
    g.tap(450, 430) // 80：剩 100，够
    expect(battle.gold).toBe(20)
    g.tap(600, 430) // 不够
    expect(battle.heroes).toHaveLength(2)
    expect(battle.hud.message.text).toBe('金币不够')
  })

  it('点英雄栏切换选中', async () => {
    const { g, battle } = await start()
    const knightBtn = battle.hud.buttons[2]!
    g.tap(knightBtn.x + 50, knightBtn.y + 50)
    expect(battle.hud.selected).toBe('knight')
  })
})

describe('攻击', () => {
  it('剑士：伤害在出手帧结算（前摇 0.24 秒内不扣血）', async () => {
    const { g, battle } = await start()
    battle.placeHero(slotAt(battle, 300, 670), 'knight')
    const e = dummy(battle, 300, 560)
    g.step() // 英雄发现目标、开始攻击
    const windup = ATTACK.durations[0]! + ATTACK.durations[1]!
    g.stepSeconds(windup - 0.03)
    expect(e.hp).toBe(1000)
    g.stepSeconds(0.05)
    expect(e.hp).toBe(1000 - baseStats().knight.damage)
  })

  it('剑士：扇形里的怪都被打中，背后的不会', async () => {
    const { g, battle } = await start()
    battle.placeHero(slotAt(battle, 300, 670), 'knight')
    const front = dummy(battle, 300, 560)
    const side = dummy(battle, 360, 590) // 前方偏右，在 100° 扇形里
    const back = dummy(battle, 300, 760) // 背后，距离够但不在扇形里
    g.stepSeconds(0.4)
    expect([front.hp, side.hp, back.hp]).toEqual([980, 980, 1000])
  })

  it('弓手：箭飞到才扣血；目标出射程就不打', async () => {
    const { g, battle } = await start()
    battle.placeHero(slotAt(battle, 300, 910), 'archer')
    const e = dummy(battle, 300, 640) // 距离 270，射程 320
    g.stepSeconds(0.3) // 出手（0.24 秒）之后箭还在飞
    expect(e.hp).toBe(1000)
    g.stepSeconds(0.3)
    expect(e.hp).toBe(990)
    const far = dummy(battle, 700, 100)
    g.stepSeconds(2)
    expect(far.hp).toBe(1000)
  })

  it('法师：火球落地范围伤害', async () => {
    const { g, battle } = await start()
    battle.placeHero(slotAt(battle, 450, 910), 'mage')
    const a = dummy(battle, 450, 700)
    const b = dummy(battle, 500, 720) // 离 a 约 54，在爆炸半径 70 内
    const c = dummy(battle, 600, 700) // 离 a 150，不在
    g.stepSeconds(1)
    expect([a.hp, b.hp, c.hp]).toEqual([986, 986, 1000])
  })

  it('攻速比动画快时动画加速播放', async () => {
    const { g, battle } = await start()
    battle.stats.archer.interval = 0.25 // 动画 0.44 秒
    const hero = (battle.placeHero(slotAt(battle, 300, 910), 'archer'), battle.heroes[0]!)
    dummy(battle, 300, 700)
    g.step()
    expect(hero.sprite.speedScale).toBeCloseTo(0.44 / 0.25)
    g.stepSeconds(2)
    expect(hero.attacks).toBeGreaterThanOrEqual(7) // 2 秒 / 0.25 秒 ≈ 8 次
  })

  it('打死怪给金币，从列表里移除', async () => {
    const { g, battle } = await start()
    battle.placeHero(slotAt(battle, 300, 670), 'knight')
    const gold = battle.gold
    const e = dummy(battle, 300, 560, 15)
    g.stepSeconds(0.4)
    expect(e.dead).toBe(true)
    g.step(2)
    expect(battle.enemies).toHaveLength(0)
    expect(battle.gold).toBe(gold + e.reward)
  })
})

describe('波次和升级', () => {
  it('一波的怪全部生成并清掉后弹出三选一；选了之后数值变化、下一波开始', async () => {
    const g = await createTestGame({ ...gameOptions, seed: 3 })
    const battle = g.scene as Battle
    expect(battle.toSpawn).toBe(WAVE.count(1))
    battle.placeHero(slotAt(battle, 300, 430), 'archer')
    // 怪物生成后直接打死（不依赖英雄的输出），只看流程
    for (let i = 0; i < 600 && battle.state === 'wave'; i++) {
      g.step()
      for (const e of battle.enemies) if (!e.dead) battle.damage(e, 1e6)
    }
    expect(battle.state).toBe('picking')
    const cards = battle.picker!.cards
    expect(cards).toHaveLength(3)
    g.stepSeconds(0.6) // 卡片弹出动画
    const card = cards[0]!
    const id = card.upgrade.id
    const before = JSON.stringify(battle.stats)
    g.tap(card.x + 100, card.y + 100)
    expect(battle.taken).toEqual([id])
    expect(JSON.stringify(battle.stats)).not.toBe(before)
    expect([battle.state, battle.round, battle.toSpawn]).toEqual(['wave', 2, WAVE.count(2)])
    g.step()
    expect(battle.picker).toBeNull()
    expect(g.dump()).not.toContain('UpgradePicker')
  })

  it('专属升级只在场上有这类英雄时出现', async () => {
    const { battle } = await start()
    battle.placeHero(slotAt(battle, 300, 430), 'knight')
    for (let i = 0; i < 20; i++) {
      battle.openPicker()
      for (const c of battle.picker!.cards) expect(c.upgrade.kind === undefined || c.upgrade.kind === 'knight').toBe(true)
      battle.picker!.queueFree()
    }
  })
})

describe('失败', () => {
  it('怪走到底线扣命，命用完失败；点屏幕重来', async () => {
    const { g, battle } = await start()
    battle.lives = 2
    for (let i = 0; i < 2; i++) battle.spawnEnemy(linePath(100 + i * 100, 1000, 1200), 10, 400)
    g.stepSeconds(1)
    expect([battle.lives, battle.state]).toEqual([0, 'lost'])
    expect(battle.hud.message.text).toContain('失败')
    g.tap(375, 300)
    for (let i = 0; i < 20 && g.scene === battle; i++) await settle()
    expect(g.scene).not.toBe(battle)
    expect((g.scene as Battle).lives).toBe(START.lives)
  })
})

describe('压力测试', () => {
  it('放满 12 个英雄、60 只怪：跑 5 秒，记录每帧逻辑耗时', async () => {
    const { g, battle } = await start()
    battle.stress(60)
    expect(battle.heroes).toHaveLength(12)
    expect(battle.heroes.every((h) => h instanceof Hero)).toBe(true)
    const t0 = performance.now()
    g.stepSeconds(5)
    const ms = (performance.now() - t0) / 300
    console.log(`[stress] 12 heroes × 60 enemies: ${ms.toFixed(3)} ms/frame (Node, headless)`)
    expect(battle.heroes.reduce((n, h) => n + h.attacks, 0)).toBeGreaterThan(50)
  })
})
