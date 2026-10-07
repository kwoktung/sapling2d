// #region example
import { Node, Node2D, Scene, Signal } from 'sapling2d'

class Enemy extends Node2D {
  readonly died = new Signal<[points: number]>() // 强类型信号：声明成只读字段
  hp = 3

  hit() {
    if (--this.hp > 0) return
    this.died.emit(10)
    this.queueFree() // 帧末销毁；销毁时它声明的信号自动断开
  }
}

class ScoreKeeper extends Node {
  total = 0
}

export class Battle extends Scene {
  enemy!: Enemy
  keeper!: ScoreKeeper

  override ready() {
    this.keeper = this.add(new ScoreKeeper())
    this.enemy = this.add(new Enemy())
    // 第二个参数是 owner：owner 被销毁时连接自动断开。监听函数用箭头函数，不会丢 this
    this.enemy.died.connect((points) => (this.keeper.total += points), this)
  }
}
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('signals', async () => {
  const g = await createTestGame({ main: Battle })
  const enemy = g.scene.enemy
  enemy.hit()
  enemy.hit()
  enemy.hit()
  expect(enemy.isQueuedForDeletion).toBe(true)
  g.step()
  expect(enemy.isFreed).toBe(true)
  expect(g.scene.keeper.total).toBe(10)
  // #region test
  // 等下一次触发：await enemy.died（游戏里 emit 发生在之后的帧）；需要先注册再同步触发时用 wait()
  const s = new Signal<[n: number]>()
  const next = s.wait()
  s.emit(7)
  expect(await next).toBe(7)
  // #endregion
})
