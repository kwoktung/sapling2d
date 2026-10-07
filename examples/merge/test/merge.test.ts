import { describe, expect, it } from 'vitest'
import { v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { DANGER_Y, DROP_Y, FLOOR_Y, FRUITS, MAX_LEVEL, WATERMELON_BONUS } from '../src/config'
import type { Fruit } from '../src/Fruit'
import { GameOverScene } from '../src/GameOverScene'
import { GameScene } from '../src/GameScene'
import { gameOptions } from '../src/game'

async function start(seed = 1, storage: Record<string, unknown> = {}) {
  const g = await createTestGame({ ...gameOptions, seed, storage })
  return g
}

const fruits = (g: Awaited<ReturnType<typeof start>>) => g.tree.getNodesInGroup('fruits') as Fruit[]
const levels = (g: Awaited<ReturnType<typeof start>>) => fruits(g).map((f) => f.level)

describe('合成大西瓜', () => {
  it('两个同级水果相撞合成高一级，加分', async () => {
    const g = await start()
    const scene = g.scene as GameScene
    scene.spawnFruit(0, v(375, FLOOR_Y - 30))
    scene.spawnFruit(0, v(380, 900))
    g.stepSeconds(2)
    expect(levels(g)).toEqual([1])
    expect(scene.score).toBe(FRUITS[1].score)
    expect(g.dump()).toContain(`Score (Label)`)
    expect(g.audio.log.map((s) => s.path)).toContain('sfx/merge.mp3')
  })

  it('连锁合成：两个 1 级 → 2 级，再和已有的 2 级 → 3 级', async () => {
    const g = await start()
    const scene = g.scene as GameScene
    // 竖直叠放：合成出的 2 级水果正好落在已有的 2 级水果上
    scene.spawnFruit(2, v(375, FLOOR_Y - 46))
    scene.spawnFruit(1, v(375, 800))
    scene.spawnFruit(1, v(375, 650))
    g.stepSeconds(4)
    expect(levels(g)).toEqual([3])
    expect(scene.score).toBe(FRUITS[2].score + FRUITS[3].score)
  })

  it('两个西瓜相撞：一起消失并获得奖励分', async () => {
    const g = await start()
    const scene = g.scene as GameScene
    scene.spawnFruit(MAX_LEVEL, v(375, FLOOR_Y - 160))
    scene.spawnFruit(MAX_LEVEL, v(380, 700))
    g.stepSeconds(2)
    expect(levels(g)).toEqual([])
    expect(scene.score).toBe(WATERMELON_BONUS)
    expect(g.audio.log.map((s) => s.path)).toContain('sfx/big.mp3')
  })

  it('点击屏幕：投放器移到手指位置，松手投放当前水果，下一个水果补上', async () => {
    const g = await start()
    const scene = g.scene as GameScene
    const [current, next] = [scene.currentLevel, scene.nextLevel]
    g.tap(200, 700)
    const dropped = fruits(g)
    expect(dropped).toHaveLength(1)
    expect(dropped[0]!.level).toBe(current)
    expect(dropped[0]!.x).toBeCloseTo(200)
    expect(dropped[0]!.y).toBeGreaterThanOrEqual(DROP_Y)
    expect(scene.currentLevel).toBe(next)
    g.stepSeconds(2)
    expect(fruits(g)[0]!.y).toBeCloseTo(FLOOR_Y - FRUITS[current]!.radius, -1) // 落到地面
  })

  it('投放有冷却：快速连点只投一个；拖拽时投放器跟着手指走', async () => {
    const g = await start()
    g.tap(300, 500)
    g.tap(400, 500)
    expect(fruits(g)).toHaveLength(1)
    g.stepSeconds(0.6)
    g.drag(v(100, 500), v(600, 500), { frames: 5 })
    expect(fruits(g)).toHaveLength(2)
    expect(fruits(g)[1]!.x).toBeGreaterThan(500)
  })

  it('点击音乐按钮切换静音，不会触发投放，设置会保存', async () => {
    const g = await start()
    const button = g.scene.children.find((c) => c.name === 'Music')!
    expect(g.dump()).toContain('音乐：开')
    const pos = (button as unknown as { globalPosition: { x: number; y: number } }).globalPosition
    g.tap(pos.x - 60, pos.y + 15)
    expect(g.tree.audio.isBusMuted('Music')).toBe(true)
    expect(g.tree.storage.get('musicMuted', false)).toBe(true)
    expect(fruits(g)).toHaveLength(0)
    expect(g.dump()).toContain('音乐：关')
  })

  it('水果堆过警戒线一段时间：游戏结束，切到结算场景，保存最高分；可以再来一局', async () => {
    const g = await start()
    const scene = g.scene as GameScene
    scene.score = 42
    // 让一个水果停在警戒线上方（关掉重力），超过豁免期 + 2 秒后判定结束
    scene.spawnFruit(5, v(375, DANGER_Y - 100)).gravityScale = 0
    g.stepSeconds(2.9)
    expect(g.tree.currentScene).toBe(scene)
    for (let i = 0; i < 60 * 2 && !(g.tree.currentScene instanceof GameOverScene); i++) {
      g.step()
      await Promise.resolve()
    }
    await new Promise((r) => setTimeout(r, 0)) // changeScene 在微任务里完成
    const over = g.tree.currentScene
    expect(over).toBeInstanceOf(GameOverScene)
    const params = (over as GameOverScene).params
    expect(params).toEqual({ score: 42, best: 42, newBest: true })
    expect(g.tree.storage.get('best', 0)).toBe(42)
    expect(g.dump()).toContain('新纪录')
    expect(g.audio.log.map((s) => s.path)).toContain('sfx/gameover.mp3')
    expect(fruits(g)).toHaveLength(0) // 旧场景的水果已销毁

    // 点“再来一局”
    g.tap(375, 860)
    await new Promise((r) => setTimeout(r, 0))
    expect(g.tree.currentScene).toBeInstanceOf(GameScene)
    expect((g.tree.currentScene as GameScene).score).toBe(0)
  })

  it('已有更高的最高分时不覆盖，结算显示“最高”而不是“新纪录”', async () => {
    const g = await start(1, { best: 99999 })
    const scene = g.scene as GameScene
    scene.spawnFruit(5, v(375, DANGER_Y - 100)).gravityScale = 0
    g.stepSeconds(4)
    await new Promise((r) => setTimeout(r, 0))
    expect(g.tree.storage.get('best', 0)).toBe(99999)
    expect((g.tree.currentScene as GameOverScene).params.newBest).toBe(false)
    expect(g.dump()).toContain('最高 99999')
  })

  it('同一个 seed、同样的操作，结果完全相同', async () => {
    const play = async () => {
      const g = await start(7)
      for (const x of [150, 600, 375, 220, 500, 375, 300, 450]) {
        g.tap(x, 600)
        g.stepSeconds(0.6)
      }
      g.stepSeconds(3)
      return g.dump()
    }
    expect(await play()).toBe(await play())
  })
})
