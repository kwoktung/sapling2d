// #region example
import { CharacterBody2D, key, rectangle, Scene, TileMapLayer, tileset, v } from 'sapling2d'

declare module 'sapling2d' {
  interface ActionRegistry {
    left: true
    right: true
    jump: true
  }
}

const TILES = tileset('tiles.png', { tileSize: 16, tiles: { 1: { collision: 'solid' }, 2: { collision: 'oneWay' } } })
const LEVEL = [
  '....................',
  '.........222........', // 单向平台：从下面能跳上去
  '....................',
  '....................',
  '11111111111111111111',
]

const GRAVITY = 1200
const SPEED = 90
const JUMP = -380

export class Player extends CharacterBody2D {
  /** 最近一次顶到的格子。 */
  bumped = ''

  constructor() {
    super({ name: 'Player', shape: rectangle(12, 16), position: v(40, 40) }) // 碰撞盒以节点位置为中心
  }

  // 移动写在 physicsProcess 里（固定 60Hz）；moveAndSlide 只能在这里调用
  override physicsProcess(dt: number) {
    const input = this.tree.input
    const dir = (input.isActionPressed('right') ? 1 : 0) - (input.isActionPressed('left') ? 1 : 0)
    // 重力每一步都加，站在地上也加：被地面挡住才算 isOnFloor
    let vy = this.velocityY + GRAVITY * dt
    // physicsProcess 里的 isActionJustPressed 按物理步算，高刷新率屏幕上也不会丢
    if (this.isOnFloor && input.isActionJustPressed('jump')) vy = JUMP
    this.setVelocity(dir * SPEED, vy) // 用 velocityX / velocityY / setVelocity，不分配 Vector2
    this.moveAndSlide()

    for (let i = 0; i < this.slideCollisionCount; i++) {
      const hit = this.getSlideCollision(i)
      if (hit.normal.y > 0) this.bumped = `${hit.cellX},${hit.cellY}` // 顶到了格子
    }
  }
}

export class Level extends Scene {
  static override assets = { tiles: TILES }
  player!: Player

  override ready() {
    const ids: Record<string, number> = { '.': 0, '1': 1, '2': 2 }
    this.add(
      new TileMapLayer({
        tileSet: TILES,
        width: LEVEL[0]!.length,
        height: LEVEL.length,
        cells: LEVEL.join('').split('').map((c) => ids[c]!),
        position: v(0, 100),
      }),
    )
    this.player = this.add(new Player())
  }
}

export const options = { main: Level, actions: { left: [key('ArrowLeft')], right: [key('ArrowRight')], jump: [key('Space')] } }
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('character-body', async () => {
  const g = await createTestGame(options)
  const p = g.scene.player
  g.stepSeconds(1)
  expect(p.isOnFloor).toBe(true)
  expect(p.y).toBe(100 + 4 * 16 - 8) // 脚底贴着地面

  g.keyDown('ArrowRight')
  g.stepSeconds(1.2) // 走到平台下面
  g.pressKey('Space')
  g.stepSeconds(0.4)
  g.keyUp('ArrowRight')
  g.stepSeconds(1)
  expect(p.isOnFloor).toBe(true)
  expect(p.y).toBe(100 + 1 * 16 - 8) // 跳上了单向平台
})
