// #region example
import { Camera2D, CanvasLayer, Label, Node2D, Rect2, Scene, v } from 'sapling2d'

class Player extends Node2D {
  override process(dt: number) {
    this.x += 300 * dt // 一直向右走，相机跟着
  }
}

export class Level extends Scene {
  coins = 0
  coinsLabel!: Label

  override ready() {
    const player = this.add(new Player({ position: v(100, 900) }))
    player.add(new Camera2D())

    // 界面层：不跟随相机，用设计坐标（屏幕上的位置）
    const hud = this.add(new CanvasLayer()) // layer 默认 1：画在场景上面
    this.coinsLabel = hud.add(new Label({ text: '金币 0', position: v(20, 20), align: 'left', verticalAlign: 'top' }))
    const pause = hud.add(new Node2D({ name: 'Pause', position: v(700, 50), inputPickable: true, hitArea: new Rect2(-40, -40, 80, 80) }))
    pause.add(new Label({ text: 'II' }))
    pause.clicked.connect(() => (this.tree.paused = !this.tree.paused))
  }

  addCoin() {
    this.coins++
    this.coinsLabel.text = `金币 ${this.coins}`
  }
}
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('canvas-layer', async () => {
  const g = await createTestGame({ main: Level })
  g.stepSeconds(5) // 玩家走出了第一屏
  expect(g.tree.viewport.visibleWorldRect.left).toBeGreaterThan(1000)
  expect(g.scene.coinsLabel.globalPosition).toEqual(v(20, 20)) // 界面还在原处
  g.tap(700, 50) // 屏幕上的暂停按钮
  expect(g.tree.paused).toBe(true)
})
