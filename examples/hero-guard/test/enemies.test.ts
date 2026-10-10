import { describe, expect, it } from 'vitest'
import { v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { ART_SCALE } from '../src/assets'
import { ELITE, ENEMIES, enemyHp, HP_GROWTH, type EnemyKind } from '../src/data/enemies'
import { WAVE_COUNT, WAVES } from '../src/data/waves'
import { gameOptions } from '../src/game'
import { linePath } from '../src/path'
import type { Battle } from '../src/scenes/Battle'

async function setup() {
  const g = await createTestGame({ ...gameOptions, seed: 6 })
  const battle = g.scene as Battle
  battle.startWith('archer', v(375, 740))
  battle.stopSpawning()
  battle.heroes[0]!.cooldown = 1e9 // 英雄不攻击
  return { g, battle }
}

const at = (b: Battle, kind: EnemyKind, x: number, y: number, hp?: number) => b.spawnEnemy(kind, linePath(x, y, y + 100000), hp)

describe('护甲（骷髅）', () => {
  it('弓箭伤害减半（飘字灰色）；爆头无视护甲；法术、近战、中毒不减', async () => {
    const { g, battle } = await setup()
    const s = at(battle, 'skeleton', 300, 300, 1000)
    battle.damage(s, 20, { arrow: true, source: 'archer' })
    expect(s.hp).toBe(990)
    g.step()
    expect(g.dump()).toMatch(/text=10 .*fontSize/)
    battle.damage(s, 20, { arrow: true, ignoreArmor: true })
    battle.damage(s, 20, { source: 'mage' })
    battle.damage(s, 20, { dot: true, source: 'archer' })
    expect(s.hp).toBe(930)
  })
})

describe('分裂史莱姆', () => {
  it('死后在原路线上前后错开分出 2 只小史莱姆（不显示路线预览），自己的经验照给', async () => {
    const { g, battle } = await setup()
    const s = at(battle, 'splitter', 300, 300, 10)
    s.dist = 200
    s.pushBack(0)
    g.step(80) // 等它自己的路线预览消失
    const died = s.dist
    battle.damage(s, 100)
    const kids = battle.enemies.filter((e) => e.kind === 'smallSlime')
    expect(kids).toHaveLength(2)
    expect(kids.map((k) => k.dist).sort((a, b) => a - b)).toEqual([died - 15, died + 15])
    expect(kids.every((k) => k.path === s.path && k.hp === enemyHp('smallSlime', 1))).toBe(true)
    expect(g.dump()).not.toContain('PathPreview')
    expect(battle.xp).toBe(ENEMIES.splitter.xp)
  })
})

describe('哥布林萨满', () => {
  it('每 0.5 秒给半径 100 内的其他怪回 4 血（每秒 8），不超过上限；半径外的不回', async () => {
    const { g, battle } = await setup()
    at(battle, 'shaman', 300, 300)
    const near = at(battle, 'slime', 340, 300, 40)
    const far = at(battle, 'slime', 600, 300, 40)
    near.hp = 20
    far.hp = 20
    g.stepSeconds(1.01)
    expect([near.hp, far.hp]).toEqual([28, 20])
    g.stepSeconds(5)
    expect(near.hp).toBe(40)
  })
})

describe('幽灵', () => {
  it('半透明；免疫减速、冰冻、眩晕、击退、嘲讽，伤害照吃', async () => {
    const { g, battle } = await setup()
    const ghost = at(battle, 'ghost', 300, 300, 1000)
    expect(ghost.alpha).toBe(0.6)
    battle.slow(ghost, 0.5, 2)
    battle.stun(ghost, 2)
    battle.tauntAura(ghost.x, ghost.y)
    ghost.frozenLeft = 0
    expect([ghost.slowPct, ghost.stunLeft, ghost.tauntLeft, ghost.speed]).toEqual([0, 0, 0, ENEMIES.ghost.speed])
    expect(battle.controllable(ghost)).toBe(false)
    battle.damage(ghost, 30)
    expect(ghost.hp).toBe(970)
    void g
  })
})

describe('精英', () => {
  it('血量 ×3、经验 ×3、漏掉扣 2 条命、体型大一号', async () => {
    const { g, battle } = await setup()
    const e = battle.spawnEnemy('slime', linePath(300, 1120, 1300), undefined, true)
    expect([e.maxHp, e.xp, e.leak, e.elite]).toEqual([ENEMIES.slime.hp * ELITE.hp, ENEMIES.slime.xp * ELITE.xp, 2, true])
    expect(e.eliteRing?.visible).toBe(true) // 脚下的暗环
    expect(e.body.scale.x).toBeCloseTo(ELITE.scale * ART_SCALE, 1)
    g.stepSeconds(4)
    expect(battle.lives).toBe(18)
  })
})

describe('波次表', () => {
  it('20 波；新怪按 spec 的顺序出场：蝙蝠 3、骷髅 4、分裂 6、萨满 7、幽灵 8；第 5、15 波有精英', () => {
    expect(WAVES).toHaveLength(WAVE_COUNT)
    const first = (kind: EnemyKind) => WAVES.findIndex((w) => w.some((g) => g.kind === kind)) + 1
    expect([first('bat'), first('skeleton'), first('splitter'), first('shaman'), first('ghost')]).toEqual([3, 4, 6, 7, 8])
    expect([1, 2].every((n) => WAVES[n - 1]!.every((g) => g.kind === 'slime'))).toBe(true)
    expect([5, 15].every((n) => WAVES[n - 1]!.some((g) => g.elite))).toBe(true)
    expect(WAVES.flat().some((g) => g.kind === 'smallSlime')).toBe(false) // 小史莱姆只由分裂产生
  })

  it('出怪时精英组生成精英；血量按波次成长 ×HP_GROWTH', async () => {
    const { g, battle } = await setup()
    battle.manual = false
    battle.startWave(5)
    for (let i = 0; i < 60 * 12; i++) {
      g.step()
      for (const e of battle.enemies) e.stunLeft = 1e9 // 别让它们漏掉
    }
    const elites = battle.enemies.filter((e) => e.elite)
    expect(elites).toHaveLength(2)
    expect(elites[0]!.maxHp).toBe(enemyHp('slime', 5, true))
    expect(enemyHp('slime', 5)).toBe(Math.round(40 * HP_GROWTH ** 4))
  })
})
