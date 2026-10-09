import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'
import { gameOptions } from '../src/game'
import { BattleScene } from '../src/scenes/BattleScene'
import { GameOverScene } from '../src/scenes/GameOverScene'
import { TitleScene } from '../src/scenes/TitleScene'

const flush = () => new Promise((r) => setTimeout(r, 0))

it('标题页显示最高分，点击开始战斗', async () => {
  const g = await createTestGame({ ...gameOptions, seed: 1, storage: { best: 4200 } })
  expect(g.scene).toBeInstanceOf(TitleScene)
  expect(g.dump()).toContain('最高分 4200')
  g.tap(375, 900)
  await flush()
  expect(g.tree.currentScene).toBeInstanceOf(BattleScene)
})

it('结算页：显示分数和新纪录，过一会儿才能点击重来（防止误触）', async () => {
  const g = await createTestGame({ ...gameOptions, seed: 1 })
  await g.tree.changeScene(GameOverScene, { score: 3000, best: 3000, newRecord: true })
  expect(g.dump()).toContain('3000')
  expect(g.dump()).toContain('新纪录')
  g.tap(375, 900) // 太快：忽略
  await flush()
  expect(g.tree.currentScene).toBeInstanceOf(GameOverScene)
  g.stepSeconds(1)
  g.tap(375, 900)
  await flush()
  expect(g.tree.currentScene).toBeInstanceOf(BattleScene)
})
