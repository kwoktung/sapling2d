// #region example
import { Node2D, Scene, v } from 'sapling2d'

/** 节点：继承引擎的节点类，覆写生命周期方法 */
class Mover extends Node2D {
  speed = 120 // 像素/秒

  override process(dt: number) {
    this.x += this.speed * dt // Vector2 不可变：用 x / y 快捷属性或重新赋值 position
  }
}

/** 场景：场景树的根。在 ready() 里用 this.add() 搭建子节点，add 返回带类型的节点 */
export class Main extends Scene {
  mover!: Mover

  override ready() {
    this.mover = this.add(new Mover({ name: 'Mover', position: v(100, 200) }))
  }
}

// 浏览器：import { startGame } from 'sapling2d/browser'; await startGame({ main: Main })
// 小游戏：import { startGame } from 'sapling2d/wechat'; startGame({ main: Main })
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('quickstart', async () => {
  // #region test
  const g = await createTestGame({ main: Main, seed: 1 })
  g.step(60) // 推进 60 帧 = 1 秒，结果是确定的
  expect(g.scene.mover.x).toBeCloseTo(220)
  console.log(g.dump())
  // Main (Main) position=(0, 0)
  //   Mover (Mover) position=(220, 200)
  // #endregion
  expect(g.dump()).toBe('Main (Main) position=(0, 0)\n  Mover (Mover) position=(220, 200)')
})
