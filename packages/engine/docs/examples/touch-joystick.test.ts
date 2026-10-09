// #region example
import { CanvasLayer, CharacterBody2D, key, rectangle, Scene, tex, TouchJoystick, v } from 'sapling2d'

declare module 'sapling2d' {
  interface ActionRegistry {
    left: true
    right: true
    up: true
    down: true
  }
}

// 键盘和摇杆共用四个方向的动作：浏览器里用 WASD，小游戏里用摇杆
export const actions = { left: [key('KeyA')], right: [key('KeyD')], up: [key('KeyW')], down: [key('KeyS')] }

class Hero extends CharacterBody2D {
  constructor() {
    super({ shape: rectangle(40, 40), position: v(375, 667) })
  }

  override physicsProcess() {
    // 长度 0–1（键盘斜着按也不超过 1）；推得越远走得越快
    const dir = this.tree.input.getVector('left', 'right', 'up', 'down')
    this.setVelocity(dir.x * 300, dir.y * 300)
    this.moveAndSlide()
  }
}

export class Field extends Scene {
  static override assets = { base: tex('arrow.png'), knob: tex('jump.png') }
  hero!: Hero

  override ready() {
    this.hero = this.add(new Hero())
    const hud = this.add(new CanvasLayer()) // 摇杆固定在屏幕上，不跟随相机
    // dynamic（默认）：在屏幕左半边按下的地方出现，松手后隐藏
    hud.add(new TouchJoystick({ actions: { left: 'left', right: 'right', up: 'up', down: 'down' }, radius: 100, texture: Field.assets.base, textureKnob: Field.assets.knob }))
  }
}
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('touch-joystick', async () => {
  const g = await createTestGame({ main: Field, actions })
  // #region test
  const input = g.tree.input
  g.pointerDown(200, 1000) // 左半边：摇杆出现在这里
  g.pointerMove(250, 1000) // 向右推了半径的一半：扣掉 20% 死区，力度 (0.5 - 0.2) / 0.8 = 0.375
  g.step()
  expect(input.getActionStrength('right')).toBeCloseTo(0.375)
  expect(input.isActionPressed('right')).toBe(false) // 力度 ≥ 0.5 才算按下
  const x0 = g.scene.hero.x
  g.pointerMove(400, 1000) // 推到底：每秒 300 像素
  g.stepSeconds(1)
  expect(g.scene.hero.x - x0).toBeCloseTo(300, 0)
  // #endregion
})
