import { describe, expect, it } from 'vitest'
import { v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { START } from '../src/config'
import { ENEMIES, enemyHp } from '../src/data/enemies'
import { WAVES } from '../src/data/waves'
import { gameOptions } from '../src/game'
import { linePath } from '../src/path'
import type { Battle } from '../src/scenes/Battle'

async function setup() {
  const g = await createTestGame({ ...gameOptions, seed: 7 })
  const battle = g.scene as Battle
  battle.startWith('archer', v(375, 740))
  battle.stopSpawning()
  battle.heroes[0]!.cooldown = 1e9
  return { g, battle }
}

/** 钉在原地的 Boss：Boss 免疫眩晕（`battle.stun` 不起作用），测试里直接给字段赋值让它停下。 */
function pin(b: Battle, kind: 'slimeKing' | 'lich', x: number, y: number) {
  const e = b.spawnEnemy(kind, linePath(x, y - 200, y + 100000))
  e.dist = 200
  e.pushBack(0)
  e.stunLeft = 1e9
  return e
}

describe('Boss 通用', () => {
  it('血量固定（不随波次成长）、免疫控制；出场提示 + 顶部血条，打掉血条跟着变，死了隐藏', async () => {
    const { g, battle } = await setup()
    expect([enemyHp('slimeKing', 10), enemyHp('lich', 20)]).toEqual([ENEMIES.slimeKing.hp, ENEMIES.lich.hp])
    const king = pin(battle, 'slimeKing', 375, 300)
    expect(battle.controllable(king)).toBe(false)
    expect(battle.hud.message.text).toBe('史莱姆王 出现！')
    battle.damage(king, 1250)
    g.step()
    expect([battle.hud.bossName.visible, battle.hud.bossName.text, battle.hud.bossFill.scale.x]).toEqual([true, '史莱姆王', 0.5])
    battle.damage(king, 5000)
    g.step()
    expect(battle.hud.bossName.visible).toBe(false)
  })

  it('漏掉扣 5 条命', async () => {
    const { g, battle } = await setup()
    battle.spawnEnemy('slimeKing', linePath(300, 1120, 1200)) // 第一次召唤（6 秒）之前就漏掉
    g.stepSeconds(4)
    expect(battle.lives).toBe(START.lives - 5)
  })

  it('第 10 波有史莱姆王、第 20 波有骷髅巫妖', () => {
    expect(WAVES[9]!.some((g) => g.kind === 'slimeKing')).toBe(true)
    expect(WAVES[19]!.some((g) => g.kind === 'lich')).toBe(true)
  })
})

describe('史莱姆王', () => {
  it('每 6 秒从身边召唤 4 只史莱姆，各走一条从它所在位置出发的新路线', async () => {
    const { g, battle } = await setup()
    const king = pin(battle, 'slimeKing', 375, 300)
    g.stepSeconds(5.9)
    expect(battle.enemies.filter((e) => e.kind === 'slime')).toHaveLength(0)
    g.stepSeconds(0.2)
    const slimes = battle.enemies.filter((e) => e.kind === 'slime')
    expect(slimes).toHaveLength(4)
    const start = { x: 0, y: 0 }
    for (const s of slimes) {
      s.path.sample(0, start)
      expect(Math.hypot(start.x - king.x, start.y - king.y)).toBeLessThan(1)
    }
    expect(new Set(slimes.map((s) => s.path)).size).toBe(4)
    g.stepSeconds(6)
    expect(battle.enemies.filter((e) => e.kind === 'slime').length).toBeGreaterThanOrEqual(8)
  })
})

describe('骷髅巫妖', () => {
  it('护甲；每 8 秒复活半径 200 内最近 6 秒内死掉的骷髅（每次最多 3 只），从死的地方接着走', async () => {
    const { g, battle } = await setup()
    const lich = pin(battle, 'lich', 375, 300)
    battle.damage(lich, 100, { arrow: true })
    expect(lich.hp).toBe(ENEMIES.lich.hp - 50)
    g.stepSeconds(3) // 巫妖第 8 秒施法，只复活 6 秒内死的：在第 3 秒杀
    const skeletons = [0, 1, 2, 3].map((i) => battle.spawnEnemy('skeleton', linePath(300 + i * 30, 300, 100000), 1))
    const far = battle.spawnEnemy('skeleton', linePath(700, 900, 100000), 1)
    for (const s of [...skeletons, far]) battle.damage(s, 10)
    expect(battle.graves).toHaveLength(5)
    g.stepSeconds(5.05)
    const revived = battle.enemies.filter((e) => e.kind === 'skeleton')
    expect(revived).toHaveLength(3) // 每次最多 3 只，远处那只不复活
    expect(revived.every((e) => Math.abs(e.y - 300) < 30 && e.hp === enemyHp('skeleton', 1))).toBe(true)
    expect(lich.revives).toBe(3)
  })

  it('一共最多复活 12 只；太久以前死的不复活', async () => {
    const { g, battle } = await setup()
    const lich = pin(battle, 'lich', 375, 300)
    lich.revives = ENEMIES.lich.revive!.total - 1
    g.stepSeconds(3)
    for (let i = 0; i < 3; i++) battle.damage(battle.spawnEnemy('skeleton', linePath(350 + i * 20, 300, 100000), 1), 10)
    g.stepSeconds(5.05) // 第 8 秒施法：只剩 1 只的额度
    expect(battle.enemies.filter((e) => e.kind === 'skeleton')).toHaveLength(1)
    // 第 9 秒死的：第 16 秒施法时已经过了 6 秒以上，不复活
    lich.revives = 0
    g.stepSeconds(1)
    for (const e of battle.enemies.filter((x) => x.kind === 'skeleton')) battle.damage(e, 1e6)
    g.stepSeconds(7.1)
    expect(battle.enemies.filter((e) => e.kind === 'skeleton')).toHaveLength(0)
  })

  it('第 20 波打死骷髅巫妖就胜利（不用等剩下的小怪）', async () => {
    const { g, battle } = await setup()
    battle.wave = 20
    battle.state = 'wave'
    const lich = pin(battle, 'lich', 375, 300)
    battle.spawnEnemy('skeleton', linePath(500, 300, 100000), 1000)
    battle.damage(lich, 1e6)
    expect(battle.state).toBe('won')
    g.step()
    expect(battle.result!.result.won).toBe(true)
  })
})
