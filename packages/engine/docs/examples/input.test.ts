// #region example
import { key, Node2D, pointerPress, rect, Scene, v } from 'sapling2d'

declare module 'sapling2d' {
  interface ActionRegistry {
    jump: true
  }
}

/** 可点击的按钮：inputPickable + hitArea（Sprite2D 不设 hitArea 时用贴图范围） */
class Button extends Node2D {
  presses = 0

  override ready() {
    this.inputPickable = true
    this.hitArea = rect(-100, -40, 200, 80) // 局部坐标
    this.clicked.connect(() => this.presses++, this) // 按下和抬起都在区域内
  }
}

export class Controls extends Scene {
  jumps = 0
  button!: Button

  override ready() {
    this.button = this.add(new Button({ position: v(375, 1200) }))
  }

  override process() {
    // 被按钮处理掉的点击不会触发 pointerPress() 绑定
    if (this.tree.input.isActionJustPressed('jump')) this.jumps++
  }
}

// 启动参数：startGame({ main: Controls, actions: { jump: [pointerPress(), key('Space')] } })
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('input', async () => {
  // #region test
  const g = await createTestGame({ main: Controls, actions: { jump: [pointerPress(), key('Space')] } })
  g.tap(375, 1200) // 设计坐标；推进 2 帧（按下、抬起）
  g.tap(100, 300) // 空白处：触发 jump
  g.pressKey('Space')
  expect(g.scene.button.presses).toBe(1)
  expect(g.scene.jumps).toBe(2)
  // #endregion
})
