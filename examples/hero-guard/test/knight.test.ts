import { describe, expect, it } from 'vitest'
import { v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { HEROES } from '../src/data/heroes'
import { availableNodes, BRANCHES, isGeneric, KNOCKBACK, QUAKE_EVERY, THORNS } from '../src/data/skills'
import { gameOptions } from '../src/game'
import { Knight } from '../src/nodes/Hero'
import { linePath } from '../src/path'
import type { Battle } from '../src/scenes/Battle'

function learn(b: Battle, ...ids: string[]) {
  for (const id of ids) b.applySkill(BRANCHES.flatMap((br) => br.nodes).find((n) => n.id === id)!)
}

/** 站着不动的怪：路线是从 (x, y) 往下的竖直线，开局先眩晕很久（眩晕不影响受伤和击退）。 */
function still(b: Battle, x: number, y: number, hp = 10000) {
  const e = b.spawnEnemy('slime', linePath(x, y - 200, y + 100000), hp)
  e.dist = 200
  e.pushBack(0) // 位置马上更新到 dist 处
  e.stunLeft = 1e9
  return e
}

/** 骑士在 1 号槽位（(375, 740)，攻击距离 150）。 */
async function withKnight() {
  const g = await createTestGame({ ...gameOptions, seed: 4 })
  const battle = g.scene as Battle
  const knight = battle.startWith('knight', v(375, 740)) as Knight
  battle.stopSpawning()
  return { g, battle, knight }
}

describe('骑士', () => {
  it('扇形斩击：前方 100° 里的都打中，背后的不打；轻微击退（沿路线往回推 KNOCKBACK）', async () => {
    const { g, battle, knight } = await withKnight()
    // 离城门最近（路线短、剩余路程少）：它是目标
    const front = battle.spawnEnemy('slime', linePath(375, 430, 700), 10000)
    front.dist = 200
    front.pushBack(0)
    front.stunLeft = 1e9
    const side = still(battle, 445, 670) // 前方偏右 45°
    const back = still(battle, 375, 840) // 背后
    const dist0 = side.dist
    while (knight.attacks < 1) g.step()
    expect([10000 - side.hp, 10000 - back.hp]).toEqual([HEROES.knight.damage, 0])
    expect(side.dist).toBe(dist0 - KNOCKBACK)
    void front
  })

  it('旋风：攻击距离 +25%、攻击间隔 −20%；质变 360°，背后的也打中', async () => {
    const { g, battle, knight } = await withKnight()
    learn(battle, 'knight.whirl.1', 'knight.whirl.2', 'knight.whirl.3', 'knight.whirl.4')
    expect(knight.stats.range).toBeCloseTo(150 * 1.25)
    expect(knight.stats.interval).toBeCloseTo(1.1 * 0.8)
    still(battle, 375, 630)
    const back = still(battle, 375, 840)
    while (knight.attacks < 1) g.step()
    expect(back.hp).toBe(10000 - HEROES.knight.damage)
  })

  it('重击：伤害 +30%、20% 几率眩晕 1 秒、对眩晕中的敌人伤害 +50%', async () => {
    const { g, battle, knight } = await withKnight()
    learn(battle, 'knight.smash.1', 'knight.smash.2', 'knight.smash.3')
    expect([knight.mods.stunChance, knight.mods.stunTime, knight.mods.stunnedMul]).toEqual([0.2, 1, 1.5])
    knight.mods.stunChance = 0
    const stunned = still(battle, 375, 600) // still() 让它一直眩晕
    const free = battle.spawnEnemy('slime', linePath(420, 400, 100000), 10000)
    free.dist = 210
    free.pushBack(0)
    free.frozenLeft = 1e9 // 冰冻：停下但不算眩晕
    while (knight.attacks < 1) g.step()
    const dmg = HEROES.knight.damage * 1.3
    expect(10000 - stunned.hp).toBeCloseTo(dmg * 1.5)
    expect(10000 - free.hp).toBeCloseTo(dmg)
  })

  it('重击质变：每第 4 次斩击震地，半径 140 内（包括背后）的敌人受伤、眩晕', async () => {
    const { g, battle, knight } = await withKnight()
    learn(battle, 'knight.smash.4')
    still(battle, 375, 620) // 前面的目标
    const back = battle.spawnEnemy('slime', linePath(375, 640, 300000), 10000) // 背后 100、剩余路程更长（不会被当成目标）：斩击打不到
    back.dist = 200
    back.pushBack(0)
    back.frozenLeft = 1e9
    while (knight.attacks < QUAKE_EVERY - 1) g.step()
    expect(back.hp).toBe(10000)
    while (knight.attacks < QUAKE_EVERY) g.step()
    expect(back.hp).toBeCloseTo(10000 - HEROES.knight.damage)
    expect(back.stunLeft).toBeGreaterThan(0.5)
  })

  it('眩晕（几率按 tree.rng）：停下、不打人', async () => {
    const { g, battle, knight } = await withKnight()
    knight.mods.stunChance = 1
    const e = battle.spawnEnemy('slime', linePath(375, 560, 100000), 10000)
    while (knight.attacks < 1) g.step()
    expect(e.stunLeft).toBeCloseTo(1, 1)
    expect(e.speed).toBe(0)
  })

  it('守护：血量 +30%、斩击吸血 15%、受到的伤害 −15%', async () => {
    const { g, battle, knight } = await withKnight()
    learn(battle, 'knight.guard.1')
    expect([knight.maxHp, knight.hp]).toEqual([600 * 1.3, 600 * 1.3])
    learn(battle, 'knight.guard.2', 'knight.guard.3')
    expect(knight.takeDamage(100)).toBeCloseTo(100 * 0.7 * 0.85)
    const before = knight.hp
    knight.sinceHit = 0 // 不让脱战回血混进来
    still(battle, 375, 600)
    while (knight.attacks < 1) g.step()
    expect(knight.hp - before).toBeCloseTo(knight.stats.damage * 0.15, 0)
  })

  it('守护质变：荆棘，受到伤害的 50% 反弹给攻击者', async () => {
    const { g, battle, knight } = await withKnight()
    learn(battle, 'knight.guard.4')
    knight.cooldown = 1e9
    const e = battle.spawnEnemy('skeleton', linePath(430, 600, 100000), 10000)
    while (knight.hp === knight.maxHp) g.step()
    const taken = knight.maxHp - knight.hp
    expect(taken).toBeCloseTo(12 * 0.7)
    expect(10000 - e.hp).toBeCloseTo(taken * THORNS)
  })

  it('三条分支都出现在三选一里', async () => {
    const { g, battle } = await withKnight()
    battle.gainXp(1000)
    g.step()
    expect(availableNodes(battle.placedKinds, battle.branchLevels).map((o) => o.branch).sort()).toEqual(['guard', 'smash', 'whirl'])
    expect(battle.picker!.offers.every((o) => isGeneric(o) || o.hero === 'knight')).toBe(true)
  })
})
