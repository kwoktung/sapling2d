// #region example
import { Camera2D, Node2D, Scene, tiledMap, v } from 'sapling2d'

// 关卡文件放在资源目录里：public/assets/levels/1-1.json（图块集和图片按 Tiled 里的相对路径放）
const LEVEL = tiledMap('levels/1-1.json')

class Coin extends Node2D {
  value = 1
}

export class Level extends Scene {
  static override assets = { level: LEVEL } // 进入场景前加载关卡文件、图块集和图片
  coins: Coin[] = []
  player!: Node2D

  override ready() {
    // 每个图块层一个 TileMapLayer，按 Tiled 里从下到上的顺序 add，叠放顺序和 Tiled 一样
    for (const layer of LEVEL.createLayers()) this.add(layer)

    // 对象层只是数据：游戏按 type（Tiled 里的 Class）自己创建节点
    for (const o of LEVEL.objects('Entities')) {
      if (o.type === 'Spawn') this.player = this.add(new Node2D({ name: 'Player', position: v(o.x, o.y) }))
      if (o.type === 'Coin') {
        const coin = this.add(new Coin({ position: v(o.x + o.width / 2, o.y + o.height / 2) })) // 矩形对象的 (x, y) 是左上角
        coin.value = Number(o.properties.value ?? 1)
        this.coins.push(coin)
      }
    }
    this.player.add(new Camera2D({ limitLeft: 0, limitTop: 0, limitRight: LEVEL.pixelWidth, limitBottom: LEVEL.pixelHeight }))
  }
}
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('tiled', async () => {
  // 无头测试从 assetsDir 读真实的关卡文件（默认 public/assets）
  const g = await createTestGame({ main: Level, assetsDir: 'test/fixtures/tiled' })
  expect(g.scene.children.map((n) => n.name).slice(0, 2)).toEqual(['Back', 'Ground'])
  expect(g.scene.player.position).toEqual(v(20, 40))
  expect(g.scene.coins.map((c) => [c.x, c.value])).toEqual([[72, 5]])
  const ground = LEVEL.createLayer('Ground')
  expect(ground.getCellTileData(2, 1)?.data.breakable).toBe(true)
})
