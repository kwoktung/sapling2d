import { describe, expect, it } from 'vitest'
import { v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { ULT } from '../src/config'
import { HEROES } from '../src/data/heroes'
import type { Knight } from '../src/nodes/Hero'
import { gameOptions } from '../src/game'
import { linePath } from '../src/path'
import type { Battle } from '../src/scenes/Battle'

/** 站着不动的怪（眩晕很久；眩晕不影响受伤）。 */
function still(b: Battle, x: number, y: number, hp = 1e6) {
  const e = b.spawnEnemy('slime', linePath(x, y - 200, y + 100000), hp)
  e.dist = 200
  e.pushBack(0)
  e.stunLeft = 1e9
  return e
}

async function setup(...kinds: ('archer' | 'mage' | 'knight')[]) {
  const g = await createTestGame({ ...gameOptions, seed: 5 })
  const battle = g.scene as Battle
  const at = [v(375, 740), v(165, 950), v(585, 950)]
  kinds.forEach((k, i) => (i === 0 ? battle.startWith(k, at[i]) : battle.placeHero(k, at[i])))
  battle.stopSpawning()
  battle.state = 'wave'
  for (const h of battle.heroes) h.cooldown = 1e9 // 英雄不普通攻击，只看大招
  return { g, battle }
}

const full = (b: Battle, k: 'archer' | 'mage' | 'knight') => (b.energy[k] = ULT.energyMax)

describe('能量', () => {
  it('英雄每造成 5 点伤害 +1 能量（按实际扣掉的血），上限 100；大招本身不回能量', async () => {
    const { battle } = await setup('archer')
    const e = still(battle, 375, 500, 100)
    battle.damage(e, 40, { source: 'archer' })
    expect(battle.energy.archer).toBe(8)
    battle.damage(e, 1000, { source: 'archer' }) // 只剩 60 血：按 60 算
    expect(battle.energy.archer).toBe(20)
    battle.chargeUlt('archer', 1e6)
    expect(battle.energy.archer).toBe(ULT.energyMax)
  })

  it('满了才能放；两次之间至少隔 12 秒；按钮显示充能、满了发光，没上场的英雄按钮是灰的', async () => {
    const { g, battle } = await setup('archer')
    expect(battle.arrowRain(375, 400)).toBe(false)
    full(battle, 'archer')
    g.step()
    const btn = battle.ultBar.buttons.archer
    expect([btn.charged, btn.glow.visible, battle.ultBar.buttons.mage.alpha]).toEqual([true, true, 0.35])
    expect(battle.arrowRain(375, 400)).toBe(true)
    expect(battle.energy.archer).toBe(0)
    full(battle, 'archer')
    expect(battle.canUlt('archer')).toBe(false) // 还不到 12 秒
    g.stepSeconds(ULT.minInterval + 0.1)
    expect(battle.canUlt('archer')).toBe(true)
  })
})

describe('三个大招', () => {
  it('箭雨：2 秒内 10 轮，每轮对圈里所有敌人造成弓手伤害 × 2.5；圈外不受伤', async () => {
    const { g, battle } = await setup('archer')
    const inside = [still(battle, 375, 400), still(battle, 450, 430)]
    const outside = still(battle, 600, 400)
    full(battle, 'archer')
    battle.arrowRain(375, 400)
    g.stepSeconds(ULT.rain.time + 0.1)
    const per = HEROES.archer.damage * ULT.rain.mul
    expect(inside.map((e) => 1e6 - e.hp)).toEqual([per * 10, per * 10])
    expect(outside.hp).toBe(1e6)
  })

  it('陨石：0.8 秒后落地，半径 160 内受法师伤害 × 16；有打击停顿，之后时间恢复', async () => {
    const { g, battle } = await setup('mage')
    const a = still(battle, 375, 400)
    const b = still(battle, 375, 700) // 300 外
    full(battle, 'mage')
    battle.meteor(375, 400)
    g.stepSeconds(ULT.meteor.delay - 0.05)
    expect(a.hp).toBe(1e6)
    g.stepSeconds(0.1)
    expect([1e6 - a.hp, b.hp]).toEqual([HEROES.mage.damage * ULT.meteor.mul, 1e6])
    g.stepSeconds(0.3)
    expect(g.tree.timeScale).toBe(1)
  })

  it('战吼：半径内的地面怪受伤、被嘲讽、被拉向骑士；Boss 只受伤；飞行和远的不受影响；骑士减伤、回血', async () => {
    const { g, battle } = await setup('knight')
    const knight = battle.heroes[0]! as Knight
    knight.cooldown = 1e9
    const near = battle.spawnEnemy('slime', linePath(375, 400, 100000), 1e6)
    near.dist = 200 // (375, 600)：离骑士 140
    near.pushBack(0)
    near.stunLeft = 1e9
    const boss = battle.spawnEnemy('slimeKing', linePath(500, 450, 100000), 1e6)
    boss.dist = 200 // (500, 650)
    boss.pushBack(0)
    const bat = battle.spawnEnemy('bat', linePath(300, 450, 100000), 1e6)
    bat.dist = 200
    bat.pushBack(0)
    const far = battle.spawnEnemy('slime', linePath(375, 100, 100000), 1e6)
    far.dist = 200 // (375, 300)：440 外
    far.pushBack(0)
    knight.takeDamage(400) // 600 × 0.7 护甲：掉 280
    const hp = knight.hp
    full(battle, 'knight')
    expect(battle.warCry()).toBe(true)
    const dmg = HEROES.knight.damage * ULT.warcry.mul
    expect([1e6 - near.hp, 1e6 - boss.hp, 1e6 - bat.hp, 1e6 - far.hp]).toEqual([dmg, dmg, 0, 0])
    expect([near.tauntLeft, boss.tauntLeft, bat.tauntLeft, far.tauntLeft]).toEqual([ULT.warcry.taunt, 0, 0, 0])
    expect(near.y).toBeCloseTo(600 + ULT.warcry.pull)
    expect(boss.y).toBe(650)
    expect(knight.hp).toBeCloseTo(hp + knight.maxHp * ULT.warcry.heal)
    expect(knight.armor).toBeCloseTo(0.7 * (1 - ULT.warcry.reduction))
    g.step()
    expect(near.target).toBe(knight)
    g.stepSeconds(ULT.warcry.time)
    expect(knight.armor).toBeCloseTo(0.7)
  })
})

describe('操作', () => {
  const ev = (x: number, y: number) => ({ x, y })
  it('弓手 / 法师：按住按钮拖到场上松手直接释放', async () => {
    for (const kind of ['archer', 'mage'] as const) {
      const { g, battle } = await setup(kind)
      full(battle, kind)
      g.step()
      const btn = battle.ultBar.buttons[kind]
      g.drag(v(btn.x + 75, btn.y + 75), v(375, 400), { frames: 6 })
      expect(battle.energy[kind]).toBe(0)
      expect(battle.aimRing.visible).toBe(false)
      expect(g.dump()).toContain(kind === 'archer' ? 'RainZone' : 'MeteorStrike')
    }
  })

  it('点一下按钮进入选点模式：场上马上出现目标圈和提示；点场上释放，再点按钮取消', async () => {
    const { g, battle } = await setup('archer')
    full(battle, 'archer')
    g.step()
    const btn = battle.ultBar.buttons.archer
    const c = ev(btn.x + 75, btn.y + 75)
    g.drag(v(c.x, c.y), v(c.x, c.y - 60), { frames: 4 }) // 没离开按钮：算点了一下
    expect([battle.ultBar.aiming, battle.ultBar.waiting, battle.aimRing.visible]).toEqual(['archer', true, true])
    expect(battle.hud.message.text).toContain('点场上释放')
    g.tap(c.x, c.y) // 再点按钮：取消
    expect([battle.ultBar.aiming, battle.aimRing.visible, battle.hud.message.text, battle.energy.archer]).toEqual([null, false, '', ULT.energyMax])
    g.tap(c.x, c.y)
    g.tap(375, 400)
    expect(battle.energy.archer).toBe(0)
    expect(g.dump()).toContain('RainZone')
  })

  it('选点模式里又从按钮拖到场上松手：在那里释放（真机上常这样操作）', async () => {
    const { g, battle } = await setup('mage')
    full(battle, 'mage')
    g.step()
    const btn = battle.ultBar.buttons.mage
    g.tap(btn.x + 75, btn.y + 75)
    expect(battle.ultBar.waiting).toBe(true)
    g.drag(v(btn.x + 75, btn.y + 75), v(375, 400), { frames: 6 })
    expect([battle.ultBar.aiming, battle.ultBar.waiting, battle.energy.mage]).toEqual([null, false, 0])
    expect(g.dump()).toContain('MeteorStrike')
  })

  it('法师：点按钮进入选点，再点场上释放；升级弹窗出现时取消选点', async () => {
    const { g, battle } = await setup('mage')
    full(battle, 'mage')
    g.step()
    const btn = battle.ultBar.buttons.mage
    g.tap(btn.x + 75, btn.y + 75)
    expect(battle.ultBar.aiming).toBe('mage')
    battle.gainXp(1000)
    g.step()
    expect([battle.ultBar.aiming, battle.energy.mage]).toEqual([null, ULT.energyMax])
    battle.picker!.cards[0]!.clicked.emit({ pointerId: 0, position: v(0, 0), localPosition: v(0, 0) })
    while (battle.picker) battle.picker.cards[0]!.clicked.emit({ pointerId: 0, position: v(0, 0), localPosition: v(0, 0) })
    battle.pendingLevels = 0
    g.step()
    g.tap(btn.x + 75, btn.y + 75)
    g.tap(375, 400)
    expect(battle.energy.mage).toBe(0)
    expect(g.dump()).toContain('MeteorStrike')
  })

  it('骑士：点按钮直接战吼', async () => {
    const { g, battle } = await setup('knight')
    full(battle, 'knight')
    g.step()
    const btn = battle.ultBar.buttons.knight
    g.tap(btn.x + 75, btn.y + 75)
    expect((battle.heroes[0] as Knight).warcryLeft).toBeGreaterThan(0)
  })
})
