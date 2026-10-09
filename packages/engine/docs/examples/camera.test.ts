// #region example
import { Camera2D, Node2D, Scene, v } from 'sapling2d'

const LEVEL_WIDTH = 4000
const LEVEL_HEIGHT = 1334

class Player extends Node2D {
  override process(dt: number) {
    this.x = Math.min(this.x + 300 * dt, LEVEL_WIDTH) // 一直向右走
  }
}

export class Level extends Scene {
  player!: Player
  camera!: Camera2D

  override ready() {
    this.player = this.add(new Player({ position: v(100, 900) }))
    // 相机挂在玩家下面：画面中心跟着玩家走；limit 让画面不超出关卡
    this.camera = this.player.add(
      new Camera2D({
        limitLeft: 0,
        limitTop: 0,
        limitRight: LEVEL_WIDTH,
        limitBottom: LEVEL_HEIGHT,
        positionSmoothingEnabled: true, // 平滑跟随（默认关闭）
      }),
    )
  }
}
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('camera', async () => {
  const g = await createTestGame({ main: Level })
  g.step()
  const vp = g.tree.viewport
  expect(vp.visibleWorldRect.left).toBe(0) // 玩家在左边：画面贴着关卡左边界
  g.stepSeconds(8)
  expect(vp.visibleWorldRect.left).toBeGreaterThan(1000) // 跟着玩家向右
  g.stepSeconds(10)
  expect(vp.visibleWorldRect.right).toBeCloseTo(LEVEL_WIDTH, 0) // 不超出右边界
  // 屏幕坐标 → 世界坐标：点击、拖拽的坐标都是世界坐标
  expect(vp.screenToWorld(v(375, 667)).x).toBeCloseTo(LEVEL_WIDTH - 375, 0)
})
