import { describe, expect, it } from 'vitest'
import { v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { BOSS, ENEMY, FEEL, KNIFE, PLAYER } from '../src/config'
import { gameOptions } from '../src/game'
import { Boss } from '../src/nodes/Boss'
import type { Enemy } from '../src/nodes/Enemy'
import { Knife } from '../src/nodes/Knife'
import type { Arena } from '../src/scenes/Arena'
import { Result } from '../src/scenes/Result'

async function start() {
  const g = await createTestGame({ ...gameOptions, seed: 1 })
  return { g, arena: g.scene as Arena }
}

const settle = () => new Promise((r) => setTimeout(r, 0))

/** 等 changeScene 完成（资源加载是异步的）。 */
async function waitForScene(g: { scene: unknown }, cls: abstract new (...args: never[]) => unknown) {
  for (let i = 0; i < 20 && !(g.scene instanceof cls); i++) await settle()
}
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

/** 只留一个敌人在玩家附近（其他的远远放着、站着不动），地上的刀也挪走。 */
function duel(arena: Arena, gap: number): Enemy {
  arena.enemies.forEach((e, i) => {
    e.position = v(-2000 * (i + 1), -3000)
    e.passive = true
  })
  for (const k of arena.groundKnives) k.position = v(-9000, -9000)
  const e = arena.enemies[0]!
  e.passive = false
  e.position = v(arena.player.x + gap, arena.player.y - 300)
  arena.player.position = v(arena.player.x, arena.player.y - 300)
  return e
}

/** 场上所有刀（刀圈里的、地上的、飞着的）。 */
const allKnives = (arena: Arena) => arena.children.filter((n) => n instanceof Knife)

describe('敌人', () => {
  it('看到玩家、刀不比玩家少太多：追过来', async () => {
    const { g, arena } = await start()
    const e = duel(arena, 500)
    g.stepSeconds(0.5)
    expect(e.state).toBe('chase')
    expect(dist(e, arena.player)).toBeLessThan(500 - ENEMY.speed * 0.3)
  })

  it('刀比玩家少太多：逃跑', async () => {
    const { g, arena } = await start()
    const e = duel(arena, 400)
    arena.giveKnives(arena.player, 10)
    g.stepSeconds(0.5)
    expect(e.state).toBe('flee')
    expect(dist(e, arena.player)).toBeGreaterThan(400 + ENEMY.speed * 0.3)
  })

  it('看不到玩家时去捡附近的刀；什么都看不到就游走', async () => {
    const { g, arena } = await start()
    const e = duel(arena, 0)
    arena.player.position = v(arena.player.x, arena.player.y + 2000) // 看不到
    e.position = v(400, 1200)
    const knife = arena.groundKnives[0]!
    knife.position = v(650, 1200)
    const n = e.knives.length
    g.stepSeconds(0.2)
    expect(e.state).toBe('collect')
    g.stepSeconds(2)
    expect(e.knives).toHaveLength(n + 1)
    expect(e.knives).toContain(knife)
    const p0 = e.position
    g.stepSeconds(1)
    expect(e.state).toBe('wander')
    expect(dist(e, p0)).toBeGreaterThan(50)
  })

  it('头顶血条跟着血量缩短', async () => {
    const { g, arena } = await start()
    const e = duel(arena, 2000)
    e.damage(1)
    g.step()
    const bar = e.children.find((n) => n.name === 'HpBar')!.children[0] as unknown as { scale: { x: number } }
    expect(bar.scale.x).toBeCloseTo((ENEMY.hp - 1) / ENEMY.hp)
  })
})

describe('打击感', () => {
  it('玩家参与的刀碰刀：火花、打击停顿（按真实时间恢复）、屏幕震动（最后回到原位）', async () => {
    const { g, arena } = await start()
    const e = duel(arena, 0)
    e.passive = true
    e.position = v(arena.player.x + arena.player.ringRadius + e.ringRadius - 10, arena.player.y)
    let froze = false
    let shook = false
    let sparks = 0
    for (let i = 0; i < 30; i++) {
      g.step()
      if (g.tree.timeScale === 0 && !froze) {
        froze = true
        sparks = arena.sparks.aliveCount // 停顿的这一刻：火花刚发出
      }
      if (!arena.camera.offset.equals(v(0, 0))) shook = true
    }
    expect([froze, shook]).toEqual([true, true])
    expect(sparks).toBeGreaterThanOrEqual(FEEL.sparks)
    // 停顿只有 FEEL.hitStop 秒真实时间；之后恢复，震动结束
    g.stepSeconds(1)
    expect(g.tree.timeScale).toBe(1)
    expect(arena.camera.offset).toEqual(v(0, 0))
  })

  it('打击停顿有冷却：连续碰撞不会一直停住', async () => {
    const { g, arena } = await start()
    arena.hitStop(FEEL.hitStop)
    expect(g.tree.timeScale).toBe(0)
    g.stepSeconds(FEEL.hitStop + 0.02)
    expect(g.tree.timeScale).toBe(1)
    arena.hitStop(FEEL.hitStop) // 冷却中
    expect(g.tree.timeScale).toBe(1)
  })
})

describe('流程', () => {
  it('敌人死亡：刀圈散落在地上、碎片飞溅、从场上消失；刀的总数不变', async () => {
    const { g, arena } = await start()
    const e = duel(arena, 2000)
    const total = allKnives(arena).length
    const knives = e.knives.length
    const ground = arena.groundKnives.length
    e.damage(e.hp)
    g.step()
    expect(arena.enemies).not.toContain(e)
    expect(arena.fighters).not.toContain(e)
    expect(arena.debris.aliveCount).toBeGreaterThan(0)
    g.stepSeconds(KNIFE.flyTime + 0.3)
    expect(e.isFreed).toBe(true)
    expect(arena.groundKnives.length).toBe(ground + knives)
    expect(allKnives(arena)).toHaveLength(total)
  })

  it('清掉所有普通敌人后 Boss 出现；打败 Boss 通关，显示结果；点屏幕再来一局', async () => {
    const { g, arena } = await start()
    duel(arena, 2000)
    for (const e of [...arena.enemies]) e.damage(e.hp)
    g.step()
    expect(arena.state).toBe('boss')
    const boss = arena.boss!
    expect(boss).toBeInstanceOf(Boss)
    expect([boss.x, boss.y, boss.knives.length, boss.hp]).toEqual([arena.bossSpawn.x, arena.bossSpawn.y, BOSS.knives, BOSS.hp])
    expect(arena.hud.enemies.text).toBe('Boss!')

    boss.damage(boss.hp)
    g.stepSeconds(0.3) // 上一次击杀的打击停顿还没结束时，这几帧没有物理步
    expect(arena.state).toBe('cleared')
    g.stepSeconds(PLAYER.deathDelay)
    await waitForScene(g, Result)
    expect(g.scene).toBeInstanceOf(Result)
    expect((g.scene as unknown as Result).params.cleared).toBe(true)
    expect(g.dump()).toContain('通关！')

    g.tap(375, 667) // 太快：结果画面刚出现时不接受输入
    await settle()
    expect(g.scene).toBeInstanceOf(Result)
    g.stepSeconds(0.5)
    g.tap(375, 667)
    await waitForScene(g, Object.getPrototypeOf(arena).constructor)
    expect((g.scene as Arena).state).toBe('fight')
    expect(g.tree.timeScale).toBe(1)
  })

  it('玩家死亡：失败', async () => {
    const { g, arena } = await start()
    arena.player.damage(arena.player.hp)
    g.step()
    expect(arena.state).toBe('dead')
    expect(arena.hud.knives.text).toBe('刀 × 0')
    g.stepSeconds(PLAYER.deathDelay + 0.3)
    await waitForScene(g, Result)
    expect((g.scene as unknown as Result).params.cleared).toBe(false)
    expect(g.dump()).toContain('失败')
  })

  it('HUD：玩家血条、刀数、剩余敌人', async () => {
    const { g, arena } = await start()
    duel(arena, 2000)
    arena.player.damage(3)
    arena.giveKnives(arena.player, 2)
    g.step()
    expect(arena.hud.hpFill.scale.x).toBeCloseTo((PLAYER.hp - 3) / PLAYER.hp)
    expect(arena.hud.knives.text).toBe(`刀 × ${PLAYER.startKnives + 2}`)
    expect(arena.hud.enemies.text).toBe('敌人 5')
  })
})

describe('Boss', () => {
  it('先在冲撞方向上显示预警区，然后冲向玩家，再恢复正常', async () => {
    const { g, arena } = await start()
    duel(arena, 2000)
    for (const e of [...arena.enemies]) e.damage(e.hp)
    g.step()
    const boss = arena.boss!
    const p = arena.player
    p.hp = 1e6 // 这个测试只看 Boss 的动作：玩家不能先被砍死
    boss.position = v(p.x + 500, p.y)
    let steps = 0
    while (boss.phase !== 'warn' && steps++ < 600) g.step()
    expect(boss.phase).toBe('warn')
    expect(boss.warning.visible).toBe(true)
    expect(boss.dashX).toBeLessThan(-0.9) // 朝向玩家（左边）
    const x0 = boss.x
    g.stepSeconds(BOSS.warnTime * 0.8)
    expect(Math.abs(boss.x - x0)).toBeLessThan(5) // 预警时站着不动
    while (boss.phase !== 'dash' && steps++ < 900) g.step()
    expect(boss.warning.visible).toBe(false)
    // 冲撞的速度（中途撞上玩家的刀圈会有打击停顿，所以看速度而不是走了多远）
    for (let i = 0; i < 10 && boss.velocityX > -1; i++) g.step() // 切换到冲撞的那一步还没动
    expect(boss.velocityX).toBeLessThan(-BOSS.dashSpeed * 0.9)
    g.stepSeconds(BOSS.dashTime + 0.3)
    expect(boss.phase).toBe('move')
  })
})
