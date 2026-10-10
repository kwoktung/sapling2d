import { describe, expect, it } from 'vitest'
import { v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { AGGRO, HERO_FEEL, ULT, ZONES } from '../src/config'
import { ENEMIES } from '../src/data/enemies'
import { GENERIC } from '../src/data/skills'
import { gameOptions } from '../src/game'
import type { Hero } from '../src/nodes/Hero'
import { linePath } from '../src/path'
import type { Battle } from '../src/scenes/Battle'

async function setup(seed = 6) {
  const g = await createTestGame({ ...gameOptions, seed })
  const battle = g.scene as Battle
  return { g, battle }
}

const inZone = (h: Hero) => {
  const z = h.zone!
  return h.x >= z.left - 0.01 && h.x <= z.right + 0.01 && h.y >= z.top - 0.01 && h.y <= z.bottom + 0.01
}

/** 一只沿竖直线往下走的怪（从 y0 开始）。 */
function walker(b: Battle, kind: Parameters<Battle['spawnEnemy']>[0], x: number, y0: number, hp = 1e6, elite = false) {
  return b.spawnEnemy(kind, linePath(x, y0, 100000), hp, elite)
}

describe('站位分区', () => {
  it('近战站中上区域的中心；远程先上场的去左下、后上场的去右下', async () => {
    const { battle } = await setup()
    const archer = battle.startWith('archer')
    battle.stopSpawning()
    const knight = battle.placeHero('knight')
    const mage = battle.placeHero('mage')
    expect([archer.zone, mage.zone, knight.zone]).toEqual([ZONES.rangedLeft, ZONES.rangedRight, ZONES.melee])
    expect([knight.x, knight.y]).toEqual([(ZONES.melee.left + ZONES.melee.right) / 2, (ZONES.melee.top + ZONES.melee.bottom) / 2])
    expect([archer, mage, knight].every(inZone)).toBe(true)
    expect(archer.x).toBeLessThan(375)
    expect(mage.x).toBeGreaterThan(375)
  })

  it('选英雄卡上有区域小地图', async () => {
    const { g, battle } = await setup()
    g.step()
    expect(battle.heroPicker!.cards.every((c) => c.children.length > 3)).toBe(true)
  })
})

describe('自动走位', () => {
  it('骑士追区域里离城门最近的地面怪，不出区域；不追蝙蝠；区域里没怪就回中心', async () => {
    const { g, battle } = await setup()
    const knight = battle.startWith('knight')
    battle.stopSpawning()
    const home = { x: knight.x, y: knight.y }
    const bat = walker(battle, 'bat', 200, 500)
    bat.stunLeft = 1e9
    g.stepSeconds(1)
    expect([knight.x, knight.y]).toEqual([home.x, home.y]) // 蝙蝠不追
    const slime = walker(battle, 'slime', 160, 450)
    slime.stunLeft = 1e9
    g.stepSeconds(3)
    expect(Math.hypot(knight.x - slime.x, knight.y - slime.y)).toBeLessThan(knight.stats.range)
    expect(inZone(knight)).toBe(true)
    // 怪在区域外：追到区域边上为止
    slime.stunLeft = 0
    slime.dist = 2000
    slime.pushBack(0)
    slime.stunLeft = 1e9
    bat.queueFree()
    bat.dead = true
    battle.damage(slime, 1e9)
    g.stepSeconds(5)
    expect([knight.x, knight.y]).toEqual([home.x, home.y])
  })

  it('远程射程内没目标时往最近的怪挪（不出区域），有目标就停下打', async () => {
    const { g, battle } = await setup()
    const archer = battle.startWith('archer')
    battle.stopSpawning()
    const home = { x: archer.x, y: archer.y }
    const e = walker(battle, 'slime', 650, 100)
    e.stunLeft = 1e9
    g.stepSeconds(4)
    expect(archer.x).toBeGreaterThan(home.x)
    expect(inZone(archer)).toBe(true)
    expect(archer.attacks).toBe(0) // 太远，挪到区域边上也够不着
    e.stunLeft = 0
    g.stepSeconds(10)
    expect(archer.attacks).toBeGreaterThan(0)
  })
})

describe('怪物仇恨', () => {
  it('地面怪看到 110 内的英雄就离开路线过去打（路线进度不动），英雄掉血、闪白、飘红字', async () => {
    const { g, battle } = await setup()
    const archer = battle.startWith('archer', v(375, 900))
    battle.stopSpawning()
    archer.cooldown = 1e9
    const e = walker(battle, 'slime', 440, 700) // 路线离英雄 65 像素
    g.stepSeconds(2)
    expect(e.target).toBe(archer)
    const dist = e.dist
    g.stepSeconds(3)
    expect(e.dist).toBe(dist)
    expect(Math.hypot(e.x - archer.x, e.y - archer.y)).toBeLessThanOrEqual(e.reach + 1)
    expect(archer.hp).toBeLessThan(HEROES_HP.archer)
    expect(archer.hp).toBeGreaterThan(HEROES_HP.archer - 6 * 5)
    expect(archer.hpBack.visible).toBe(true)
    expect(g.audio.log.some((s) => s.path === 'audio/hero_hit.mp3')).toBe(true)
  })

  it('飞行的怪不理英雄；路线离得远的地面怪也不理', async () => {
    const { g, battle } = await setup()
    const archer = battle.startWith('archer', v(375, 900))
    battle.stopSpawning()
    archer.cooldown = 1e9
    const bat = walker(battle, 'bat', 400, 700)
    const far = walker(battle, 'slime', 375 + AGGRO.radius + 60, 700)
    g.stepSeconds(2.5)
    expect([bat.target, far.target]).toEqual([null, null])
    expect(archer.hp).toBe(archer.maxHp)
  })

  it('英雄阵亡后，围攻它的怪从当前位置接着往下走（不走回原来的路线）', async () => {
    const { g, battle } = await setup()
    const archer = battle.startWith('archer', v(375, 900))
    battle.stopSpawning()
    archer.cooldown = 1e9
    const e = walker(battle, 'skeleton', 440, 700, 1e6, true) // 精英：攻击力 ×2
    g.stepSeconds(2)
    const before = archer.hp
    while (archer.hp === before) g.step()
    expect(before - archer.hp).toBeCloseTo(ENEMIES.skeleton.attack!.damage * 2)
    const oldPath = e.path
    archer.takeDamage(1e6)
    g.step()
    expect([e.target, e.ox, e.oy, e.path === oldPath]).toEqual([null, 0, 0, false])
    // 新路线从它站的地方出发，一路往下（y 不减小）
    let y = e.y
    for (let i = 0; i < 120; i++) {
      g.step()
      expect(e.y).toBeGreaterThanOrEqual(y - 0.01)
      y = e.y
    }
    expect(e.y).toBeGreaterThan(900)
  })

  it('在路线外（打英雄时）死掉的分裂史莱姆：小史莱姆从死的地方出来', async () => {
    const { g, battle } = await setup()
    const archer = battle.startWith('archer', v(375, 900))
    battle.stopSpawning()
    archer.cooldown = 1e9
    const s = walker(battle, 'splitter', 450, 700)
    g.stepSeconds(3)
    expect(s.target).toBe(archer)
    const at = { x: s.x, y: s.y }
    battle.damage(s, 1e9)
    const kids = battle.enemies.filter((e) => e.kind === 'smallSlime')
    expect(kids).toHaveLength(2)
    for (const k of kids) expect(Math.hypot(k.x - at.x, k.y - at.y)).toBeLessThan(40)
  })

  it('被击退后重新走回英雄身边', async () => {
    const { g, battle } = await setup()
    const archer = battle.startWith('archer', v(375, 900))
    battle.stopSpawning()
    archer.cooldown = 1e9
    const e = walker(battle, 'slime', 440, 700)
    g.stepSeconds(3)
    e.pushBack(40)
    expect(e.inReach).toBe(false)
    g.stepSeconds(1.5)
    expect(e.inReach).toBe(true)
  })
})

describe('血量、阵亡和复活', () => {
  it('脱战 3 秒后每秒回 5% 血', async () => {
    const { g, battle } = await setup()
    const archer = battle.startWith('archer', v(375, 900))
    battle.stopSpawning()
    archer.takeDamage(100)
    g.stepSeconds(HERO_FEEL.regenDelay - 0.1)
    expect(archer.hp).toBe(80)
    g.stepSeconds(1.1)
    expect(archer.hp).toBeGreaterThan(80 + 180 * 0.05 * 0.9)
  })

  it('阵亡：变墓碑、显示倒计时、不攻击、不能放大招（能量保留）；15 秒后原地复活，满血、1 秒无敌', async () => {
    const { g, battle } = await setup()
    const archer = battle.startWith('archer', v(375, 900))
    battle.stopSpawning()
    battle.state = 'wave'
    battle.energy.archer = ULT.energyMax
    battle.hurtHero(archer, 1e6)
    expect([archer.dead, archer.tomb.visible, archer.body.visible, archer.countdown.text]).toEqual([true, true, false, '15'])
    expect(g.audio.log.some((s) => s.path === 'audio/hero_die.mp3')).toBe(true)
    const e = walker(battle, 'slime', 375, 600)
    e.stunLeft = 1e9
    g.stepSeconds(5.1)
    expect(archer.attacks).toBe(0)
    expect(battle.canUlt('archer')).toBe(false)
    expect(battle.arrowRain(375, 600)).toBe(false)
    expect(battle.energy.archer).toBe(ULT.energyMax)
    expect(battle.ultBar.buttons.archer.respawnLabel.text).toBe('10')
    g.stepSeconds(10)
    expect([archer.dead, archer.hp, archer.tomb.visible, archer.body.visible]).toEqual([false, archer.maxHp, false, true])
    expect(archer.takeDamage(50)).toBe(0) // 无敌
    g.stepSeconds(HERO_FEEL.invulnerable)
    expect(archer.takeDamage(50)).toBe(50)
    expect(battle.canUlt('archer')).toBe(true)
  })

  it('通用选项“坚韧”：全体英雄血量 +20%（多出来的血直接加上）', async () => {
    const { battle } = await setup()
    const archer = battle.startWith('archer', v(375, 900))
    battle.stopSpawning()
    archer.takeDamage(50)
    battle.applyGeneric(GENERIC.find((o) => o.effect === 'hp')!)
    expect([archer.maxHp, archer.hp]).toEqual([180 * 1.2, 130 + 36])
    const knight = battle.placeHero('knight')
    expect(knight.maxHp).toBe(600 * 1.2)
  })

  it('冲锋从骑士当前的位置出发，冲完回到原位', async () => {
    const { g, battle } = await setup()
    const knight = battle.startWith('knight')
    battle.stopSpawning()
    battle.state = 'wave'
    knight.x = 200
    knight.y = 700
    battle.energy.knight = ULT.energyMax
    expect(battle.knightCharge()).toBe(true)
    g.stepSeconds(ULT.charge.time * 0.4)
    expect(knight.y).toBeLessThan(500)
    while (knight.busy) g.step()
    expect([knight.x, Math.round(knight.y)]).toEqual([200, 700])
  })
})

const HEROES_HP = { archer: 180 }
