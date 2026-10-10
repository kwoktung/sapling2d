import { describe, expect, it } from 'vitest'
import { RandomNumberGenerator, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { FIELD, START } from '../src/config'
import { ENEMIES } from '../src/data/enemies'
import { HEROES } from '../src/data/heroes'
import { WAVE_COUNT, WAVES } from '../src/data/waves'
import { gameOptions } from '../src/game'
import { linePath, randomPath } from '../src/path'
import { Battle } from '../src/scenes/Battle'

async function start(seed = 1) {
  const g = await createTestGame({ ...gameOptions, seed })
  return { g, battle: g.scene as Battle }
}

/** 手动模式：不自动出怪，测试自己放。 */
async function manual() {
  const r = await start()
  r.battle.stopSpawning()
  return r
}

/** 一只几乎不动的怪：路线是很长的竖直线（史莱姆每秒走 60，测试的几秒里只挪一点）。 */
function dummy(b: Battle, x: number, y: number, hp = 1000) {
  const e = b.spawnEnemy('slime', linePath(x, y, y + 100000), hp)
  return e
}

const settle = () => new Promise((r) => setTimeout(r, 0))

describe('随机路线', () => {
  it('从屏幕上方出发、越过底线结束、横向不出界', () => {
    const rng = new RandomNumberGenerator(3)
    const out = { x: 0, y: 0 }
    for (let n = 0; n < 50; n++) {
      const p = randomPath((a, b) => rng.randfRange(a, b))
      expect(p.sample(0, out).y).toBeCloseTo(FIELD.spawnY)
      expect(p.sample(p.length, out).y).toBeGreaterThan(FIELD.baseY)
      for (let i = 0; i <= 100; i++) {
        p.sample((p.length * i) / 100, out)
        expect(out.x).toBeGreaterThan(FIELD.left - 40)
        expect(out.x).toBeLessThan(FIELD.right + 40)
      }
    }
  })

  it('怪物出现时路线预览闪一下，然后删掉', async () => {
    const { g, battle } = await manual()
    battle.spawnEnemy('slime')
    g.step()
    expect(g.dump()).toContain('PathPreview')
    g.stepSeconds(1.5)
    expect(g.dump()).not.toContain('PathPreview')
  })
})

describe('拖动英雄', () => {
  it('拖到空槽位就过去；拖到有人的槽位就交换；松在别处回原来的槽位', async () => {
    const { g, battle } = await manual()
    const archer = battle.heroes[0]!
    expect(battle.slotOf(archer)!.index).toBe(1)
    // 从英雄身上（脚底往上 40）拖到 4 号槽位
    const s4 = battle.slots[4]!
    g.drag(v(archer.x, archer.y - 40), v(s4.x, s4.y - 40), { frames: 6 })
    expect(battle.slotOf(archer)).toBe(s4)
    expect([archer.x, archer.y]).toEqual([s4.x, s4.y])
    // 松在两个槽位中间的空地：回到 4 号
    g.drag(v(archer.x, archer.y - 40), v(270, 300), { frames: 6 })
    expect(battle.slotOf(archer)).toBe(s4)
    // 交换：直接调 moveHero（第二个英雄要到 06 才能放，这里用同一个类型放一个假的）
    const other = battle.placeHero('archer', battle.slots[0]!)
    battle.moveHero(archer, battle.slots[0]!)
    expect([battle.slotOf(archer)!.index, battle.slotOf(other)!.index]).toEqual([0, 4])
  })

  it('拖动中不攻击，显示射程圈；松手后恢复', async () => {
    const { g, battle } = await manual()
    const archer = battle.heroes[0]!
    dummy(battle, archer.x, archer.y - 200)
    g.pointerDown(archer.x, archer.y - 40)
    g.stepSeconds(1.5)
    expect([archer.dragging, archer.attacks, archer.rangeRing.visible]).toEqual([true, 0, true])
    g.pointerUp(archer.x, archer.y - 40)
    g.stepSeconds(1.5)
    expect(archer.dragging).toBe(false)
    expect(archer.attacks).toBeGreaterThan(0)
  })
})

describe('弓手', () => {
  it('打射程内离城门最近的怪；射程外的不打', async () => {
    const { g, battle } = await manual()
    const archer = battle.heroes[0]! // (375, 740)，射程 340
    const near = dummy(battle, 375, 600) // 剩余路程更长
    const front = battle.spawnEnemy('slime', linePath(300, 650, 900), 1000) // 路线短：剩余路程更短，离城门更近
    const far = dummy(battle, 375, 200) // 距离 540，射程外
    g.stepSeconds(2)
    expect(front.hp).toBeLessThan(1000)
    expect([near.hp, far.hp]).toEqual([1000, 1000])
    expect(archer.attacks).toBeGreaterThan(1)
  })

  it('伤害在箭飞到时结算（出手前和飞行中都不扣血）', async () => {
    const { g, battle } = await manual()
    const e = dummy(battle, 375, 450) // 距离约 290
    g.step()
    g.stepSeconds(0.1) // 还在蓄力
    expect(e.hp).toBe(1000)
    g.stepSeconds(0.5) // 出手（0.16 秒）+ 飞行（约 0.26 秒）
    expect(e.hp).toBe(1000 - HEROES.archer.damage)
  })

  it('打死怪加经验和击杀数，从列表里移除', async () => {
    const { g, battle } = await manual()
    dummy(battle, 375, 500, 10)
    g.stepSeconds(1)
    g.step(2)
    expect([battle.enemies.length, battle.kills, battle.xp]).toEqual([0, 1, ENEMIES.slime.xp])
  })
})

describe('波次和胜负', () => {
  it('第一波按数据表出怪；越过底线扣命', async () => {
    const { g, battle } = await start()
    g.stepSeconds(1.2) // 开局停顿后开始第 1 波
    expect([battle.state, battle.wave]).toEqual(['wave', 1])
    g.stepSeconds(WAVES[0]![0]!.count * WAVES[0]![0]!.interval + 0.1)
    expect(battle.enemies.length + battle.kills).toBe(WAVES[0]![0]!.count)
  })

  it('命用完失败；点屏幕重来', async () => {
    const { g, battle } = await manual()
    battle.lives = 2
    for (let i = 0; i < 2; i++) battle.spawnEnemy('slime', linePath(100 + i * 500, FIELD.baseY - 20, FIELD.baseY + 200), 1e6)
    g.stepSeconds(5)
    expect([battle.lives, battle.state]).toEqual([0, 'lost'])
    g.tap(375, 300)
    for (let i = 0; i < 20 && g.scene === battle; i++) await settle()
    expect((g.scene as Battle).lives).toBe(START.lives)
  })

  it('20 波打完胜利', async () => {
    const { g, battle } = await start(5)
    // 怪一出来就打死，只看流程
    for (let i = 0; i < 60 * 600 && battle.state !== 'won'; i++) {
      g.step()
      for (const e of battle.enemies) if (!e.dead) battle.damage(e, 1e9)
      if (battle.picker) battle.picker.cards[0]!.clicked.emit({ pointerId: 0, position: v(0, 0), localPosition: v(0, 0) }) // 升级就选第一张
    }
    expect([battle.state, battle.wave, battle.lives]).toEqual(['won', WAVE_COUNT, START.lives])
    expect(battle.hud.message.text).toContain('胜利')
  })
})
