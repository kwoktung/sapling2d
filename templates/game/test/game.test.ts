import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'
import { gameOptions, type MainScene } from '../src/game'

it('点击放下小球，小球落到地面上', async () => {
  const g = await createTestGame({ ...gameOptions, seed: 1 })
  g.tap(300, 400)
  g.stepSeconds(3)
  const balls = g.tree.getNodesInGroup('balls')
  expect(balls).toHaveLength(1)
  expect(balls[0]!.y).toBeCloseTo(1200 - 40, 0) // 地面上表面 1200，半径 40
  expect((g.scene as MainScene).count).toBe(1)
  expect(g.audio.log.map((s) => s.path)).toEqual(['pop.mp3'])
})
