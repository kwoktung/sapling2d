import { describe, expect, it } from 'vitest'
import { v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { PLAYER } from '../src/config'
import { gameOptions } from '../src/game'
import { BattleScene } from '../src/scenes/BattleScene'
import { GameOverScene } from '../src/scenes/GameOverScene'

/** 关掉自动出怪的战斗场景：敌机、子弹、道具都由测试直接摆放。 */
class QuietBattle extends BattleScene {
  constructor() {
    super({ waves: false })
  }
}

/** 自动出怪、玩家无敌：测试出怪节奏时不会中途结束。 */
class GodBattle extends BattleScene {
  constructor() {
    super({ godMode: true })
  }
}

async function battle(options: { storage?: Record<string, unknown> } = {}) {
  const g = await createTestGame({ ...gameOptions, main: QuietBattle, seed: 1, ...options })
  return { g, scene: g.scene as BattleScene }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('玩家', () => {
  it('出生在屏幕下方，自动向上射击', async () => {
    const { g, scene } = await battle()
    expect([scene.player.x, scene.player.y]).toEqual([375, 1334 - PLAYER.bottomMargin])
    g.stepSeconds(0.5)
    expect(scene.playerBullets.length).toBeGreaterThanOrEqual(3)
    expect(scene.playerBullets.every((b) => b.vy < 0)).toBe(true)
    expect(g.audio.log.some((s) => s.path === 'sfx/shoot.mp3')).toBe(true)
  })

  it('拖动：战机跟着手指的位移走（不是跳到手指下面），并限制在屏幕内', async () => {
    const { g, scene } = await battle()
    const start = scene.player.position
    g.drag(v(100, 600), v(200, 500))
    expect(scene.player.x).toBeCloseTo(start.x + 100)
    expect(scene.player.y).toBeCloseTo(start.y - 100)
    g.drag(v(100, 600), v(1000, 600))
    expect(scene.player.x).toBe(750 - PLAYER.edgeMargin)
  })

  it('键盘方向键移动', async () => {
    const { g, scene } = await battle()
    const x0 = scene.player.x
    g.keyDown('ArrowLeft')
    g.stepSeconds(0.25)
    g.keyUp('ArrowLeft')
    g.step()
    expect(scene.player.x).toBeCloseTo(x0 - PLAYER.keyboardSpeed * 0.25, -1)
  })
})

describe('战斗', () => {
  it('子弹击毁小飞机：加分、爆炸、音效', async () => {
    const { g, scene } = await battle()
    scene.spawnEnemy('small', v(375, 700))
    for (let i = 0; i < 60 && scene.enemies.length > 0; i++) g.step()
    expect(scene.enemies).toHaveLength(0)
    expect(scene.score).toBe(100)
    expect(g.dump()).toContain('Explosion (AnimatedSprite2D)')
    expect(g.dump()).toMatch(/Debris \(Particles2D\).* particles=1[0-9]/) // 碎片粒子
    g.stepSeconds(1)
    expect(g.dump()).not.toContain('Explosion') // 播完自动销毁
    expect(g.dump()).not.toContain('Debris')
    expect(g.audio.log.some((s) => s.path === 'sfx/explode.mp3')).toBe(true)
  })

  it('中型飞机要打好几下，每次被击中闪红', async () => {
    const { g, scene } = await battle()
    const enemy = scene.spawnEnemy('medium', v(375, 900)) // 离得近：子弹飞到之前它还没摆开
    enemy.fireEnabled = false
    let hits = 0
    while (enemy.hp === enemy.maxHp && hits++ < 60) g.step()
    expect(enemy.hp).toBe(enemy.maxHp - 1)
    expect(enemy.modulate).not.toBe(0xffffff)
    g.stepSeconds(0.5)
    expect(enemy.modulate).toBe(0xffffff)
  })

  it('被敌方子弹击中：掉一条命、短暂无敌；无敌期间不再掉命', async () => {
    const { g, scene } = await battle()
    const p = scene.player
    scene.spawnEnemyBullet(p.position, v(0, 300))
    g.step()
    expect(p.lives).toBe(PLAYER.lives - 1)
    expect(p.invincible).toBe(true)
    scene.spawnEnemyBullet(p.position, v(0, 300)) // 无敌期间穿过战机
    g.step()
    expect(p.lives).toBe(PLAYER.lives - 1)
    expect(g.audio.log.filter((s) => s.path === 'sfx/hit.mp3')).toHaveLength(1)
    g.stepSeconds(PLAYER.invincibleSeconds + 0.1)
    expect(p.lives).toBe(PLAYER.lives - 1)
    expect(p.invincible).toBe(false)
    expect(p.alpha).toBe(1)
  })

  it('撞上敌机也掉命，敌机被撞毁；武器降一级', async () => {
    const { g, scene } = await battle()
    scene.player.power = 3
    scene.spawnEnemy('small', scene.player.position)
    g.step()
    expect(scene.player.lives).toBe(PLAYER.lives - 1)
    expect(scene.player.power).toBe(2)
    expect(scene.enemies).toHaveLength(0)
  })

  it('最后一条命没了：进入结算，记录最高分', async () => {
    const { g, scene } = await battle({ storage: { best: 500 } })
    scene.player.lives = 1
    scene.score = 1234
    scene.spawnEnemyBullet(scene.player.position, v(0, 0))
    g.stepSeconds(2)
    await flush()
    const over = g.tree.currentScene as GameOverScene
    expect(over).toBeInstanceOf(GameOverScene)
    expect(over.params).toEqual({ score: 1234, best: 1234, newRecord: true })
    expect(g.tree.storage.get('best', 0)).toBe(1234)
    expect(g.audio.log.some((s) => s.path === 'sfx/gameover.mp3')).toBe(true)
  })

  it('武器道具提升火力（每轮子弹变多，最高 4 级）；生命道具加命（有上限）', async () => {
    const { g, scene } = await battle()
    /** 每轮射击的子弹数：跑 1 秒取平均。 */
    const volley = () => {
      const shots = scene.firedShots
      const volleys = scene.firedVolleys
      g.stepSeconds(1)
      return (scene.firedShots - shots) / (scene.firedVolleys - volleys)
    }
    expect(volley()).toBe(1)
    for (let i = 0; i < 5; i++) {
      scene.spawnPowerUp('power', scene.player.position)
      g.step()
    }
    expect(scene.player.power).toBe(4)
    expect(volley()).toBe(5)
    for (let i = 0; i < 5; i++) {
      scene.spawnPowerUp('life', scene.player.position)
      g.step()
    }
    expect(scene.player.lives).toBe(PLAYER.maxLives)
    expect(g.audio.log.filter((s) => s.path === 'sfx/powerup.mp3')).toHaveLength(10)
  })
})

describe('出怪', () => {
  it('随时间出怪，越来越难；同样的种子结果完全相同', async () => {
    const run = async () => {
      const g = await createTestGame({ ...gameOptions, main: GodBattle, seed: 7 })
      const scene = g.scene as BattleScene
      g.stepSeconds(5)
      const early = scene.spawned
      g.stepSeconds(55)
      return { early, total: scene.spawned, kinds: new Set(scene.spawnLog.map((s) => s.kind)), dump: g.dump() }
    }
    const a = await run()
    expect(a.early).toBeGreaterThan(0)
    expect(a.total - a.early).toBeGreaterThan(a.early * 11 * 1.3) // 后 55 秒的出怪速度明显高于前 5 秒
    expect([...a.kinds].sort()).toEqual(['large', 'medium', 'small'])
    const b = await run()
    expect(b.dump).toBe(a.dump)
  })
})

describe('暂停', () => {
  it('点暂停按钮：世界静止；点任意处继续', async () => {
    const { g, scene } = await battle()
    const enemy = scene.spawnEnemy('small', v(100, 300))
    const pause = scene.hud.pauseButton.globalPosition
    g.tap(pause.x, pause.y)
    expect(g.tree.paused).toBe(true)
    const y = enemy.y
    const shots = scene.firedShots
    g.stepSeconds(1)
    expect([enemy.y, scene.firedShots]).toEqual([y, shots])
    g.tap(375, 667)
    expect(g.tree.paused).toBe(false)
    g.stepSeconds(0.2)
    expect(enemy.y).toBeGreaterThan(y)
  })
})
