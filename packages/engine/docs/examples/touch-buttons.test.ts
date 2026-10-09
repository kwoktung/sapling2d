// #region example
import { CanvasLayer, key, Rect2, Scene, tex, TouchScreenButton, v } from 'sapling2d'

declare module 'sapling2d' {
  interface ActionRegistry {
    left: true
    right: true
    jump: true
  }
}

// 键盘和屏幕按钮共用同一个动作名：浏览器里用方向键，小游戏里用按钮
export const actions = { left: [key('ArrowLeft')], right: [key('ArrowRight')], jump: [key('Space')] }

const PAD = new Rect2(-90, -90, 180, 180) // 触摸区域比按钮图片大，手指不容易按偏

export class Controls extends Scene {
  static override assets = { arrow: tex('arrow.png'), jump: tex('jump.png') }
  jumps = 0

  override ready() {
    const hud = this.add(new CanvasLayer()) // 按钮固定在屏幕上，不跟随相机
    const { arrow, jump } = Controls.assets
    // passbyPress：手指从“左”滑到“右”不用抬起
    hud.add(new TouchScreenButton({ name: 'Left', action: 'left', texture: arrow, flipH: true, position: v(110, 1220), hitArea: PAD, passbyPress: true }))
    hud.add(new TouchScreenButton({ name: 'Right', action: 'right', texture: arrow, position: v(300, 1220), hitArea: PAD, passbyPress: true }))
    hud.add(new TouchScreenButton({ name: 'Jump', action: 'jump', texture: jump, position: v(640, 1220), hitArea: PAD }))
  }

  override physicsProcess() {
    // 和键盘一样查询动作；physicsProcess 里的 isActionJustPressed 按物理步算
    if (this.tree.input.isActionJustPressed('jump')) this.jumps++
  }
}
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('touch-buttons', async () => {
  const g = await createTestGame({ main: Controls, actions })
  const input = g.tree.input
  g.pointerDown(300, 1220, 1) // 一只手按住“右”
  g.pointerDown(640, 1220, 2) // 另一只手按“跳”
  g.step()
  expect([input.isActionPressed('right'), g.scene.jumps]).toEqual([true, 1])
  g.pointerMove(110, 1220, 1) // 滑到“左”
  g.step()
  expect([input.isActionPressed('left'), input.isActionPressed('right')]).toEqual([true, false])
  g.pointerUp(110, 1220, 1)
  g.pointerUp(640, 1220, 2)
  g.step()
  expect(input.isActionPressed('left')).toBe(false)
})
