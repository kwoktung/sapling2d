// #region example
import { Node, Node2D, Scene, v } from 'sapling2d'

class Coin extends Node2D {
  value = 1
}

/** 全局单例：跨场景保留，用类型取出 */
class GameState extends Node {
  coins = 0
}

// 声明合并：注册之后组名有补全、写错是类型错误，getNodesInGroup 返回 Coin[]
declare module 'sapling2d' {
  interface GroupRegistry {
    coins: Coin
  }
}

export class Level extends Scene {
  override ready() {
    for (let i = 0; i < 3; i++) this.add(new Coin({ position: v(100 * i, 0), groups: ['coins'] }))
  }

  collectAll() {
    const state = this.tree.autoload(GameState)
    for (const coin of this.tree.getNodesInGroup('coins')) {
      state.coins += coin.value
      coin.queueFree()
    }
  }
}

// 启动参数里注册：startGame({ main: Level, autoloads: [GameState] })
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('groups and autoload', async () => {
  const g = await createTestGame({ main: Level, autoloads: [GameState] })
  g.scene.collectAll()
  g.step()
  expect(g.tree.autoload(GameState).coins).toBe(3)
  expect(g.tree.getNodesInGroup('coins')).toHaveLength(0)
})
