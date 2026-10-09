// #region example
import { Scene, TileMapLayer, tileset, v } from 'sapling2d'

// 图块集：图集里每格 16px，编号从 1 开始（左上角是 1，从左到右、从上到下）
const TILES = tileset('tiles.png', {
  tileSize: 16,
  tiles: {
    1: { collision: 'solid' }, // 地面
    2: { collision: 'solid', data: { breakable: true } }, // 砖块
    3: { collision: 'oneWay' }, // 单向平台
  },
})

// 关卡用字符画写在代码里；以后可以从 Tiled 导入
const LEVEL = [
  '................',
  '.....222........',
  '..........333...',
  '................',
  '1111111111111111',
]
const IDS: Record<string, number> = { '.': 0, '1': 1, '2': 2, '3': 3 }

export class Level extends Scene {
  static override assets = { tiles: TILES }
  ground!: TileMapLayer

  override ready() {
    this.ground = this.add(
      new TileMapLayer({
        name: 'Ground',
        tileSet: TILES,
        width: LEVEL[0]!.length,
        height: LEVEL.length,
        cells: LEVEL.join('').split('').map((c) => IDS[c]!),
        position: v(0, 200), // 格子 (0, 0) 的左上角在这里
      }),
    )
  }

  /** 顶砖块：point 是图层的局部坐标（像素）。 */
  bump(point: { x: number; y: number }) {
    const cell = this.ground.localToMap(v(point.x, point.y))
    if (this.ground.getCellTileData(cell.x, cell.y)?.data.breakable) this.ground.eraseCell(cell.x, cell.y)
  }
}
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('tilemap', async () => {
  const g = await createTestGame({ main: Level })
  const ground = g.scene.ground
  expect(ground.getCell(0, 4)).toBe(1)
  expect(ground.getCellTileData(10, 2)?.collision).toBe('oneWay')
  g.scene.bump({ x: 6 * 16 + 3, y: 1 * 16 + 8 }) // 第 6 列第 1 行：砖块
  g.scene.bump({ x: 2 * 16, y: 4 * 16 }) // 地面不能顶碎
  expect([ground.getCell(6, 1), ground.getCell(2, 4)]).toEqual([0, 1])
  expect(ground.mapToLocal(v(6, 1))).toEqual(v(104, 24)) // 格子中心
})
