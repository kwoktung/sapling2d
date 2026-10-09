import type { Container, Mesh } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { Node2D, Scene, TileMapLayer, tileset, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { PixiRenderer } from '../src/render/PixiRenderer'
import { TILE_EMPTY, TILE_ONE_WAY, TILE_SOLID } from '../src/core/tileset'

const set = (name: string) =>
  tileset(`${name}.png`, { tileSize: 16, tiles: { 1: { collision: 'solid' }, 2: { collision: 'oneWay' }, 3: { data: { breakable: true } } } })

describe('TileSet', () => {
  it('图块属性：碰撞类型和自定义字段；没定义的图块没有碰撞', () => {
    const s = set('ts-props')
    expect(s.tile(1)).toMatchObject({ id: 1, collision: 'solid' })
    expect(s.tile(2).collision).toBe('oneWay')
    expect(s.tile(3)).toMatchObject({ collision: null, data: { breakable: true } })
    expect(s.tile(9)).toMatchObject({ id: 9, collision: null, data: {} })
    expect(s.tile(9)).toBe(s.tile(9))
    expect(Object.isFrozen(s.tile(3).data)).toBe(true)
  })

  it('参数检查', () => {
    expect(() => tileset('ts-bad.png', { tileSize: 0 })).toThrow(/tileSize must be positive/)
    expect(() => tileset('ts-bad.png', { tileSize: 16, tiles: { 0: {} } })).toThrow(/start at 1/)
    expect(() => tileset('ts-bad.png', { tileSize: 16, tiles: { 1: { collision: 'wall' as never } } })).toThrow(/unknown collision 'wall'/)
    expect(() => set('ts-bad2').tile(0)).toThrow(/start at 1/)
    expect(() => set('ts-bad2').tile(70000)).toThrow(/at most 65535/)
  })

  it('列数：可以直接给出，否则按图片宽度、留白和间距计算', () => {
    expect(tileset('ts-cols-a.png', { tileSize: 16, columns: 5 }).columns).toBe(5)
    const s = tileset('ts-cols-b.png', { tileSize: 16, margin: 1, spacing: 2 })
    expect(s.columns).toBe(0) // 还没加载
    s.texture._setLoaded({}, 1 + 16 * 4 + 2 * 3 + 1, 16)
    expect(s.columns).toBe(4)
  })

  it('放在 static assets 里随场景加载', async () => {
    const tiles = set('ts-scene')
    class Main extends Scene {
      static override assets = { tiles }
    }
    await createTestGame({ main: Main })
    expect(tiles.isLoaded).toBe(true)
  })
})

describe('TileMapLayer 数据', () => {
  const layer = (cells?: number[]) => new TileMapLayer({ name: 'Ground', tileSet: set('layer-data'), width: 4, height: 3, ...(cells ? { cells } : {}) })

  it('读写格子；地图外读出 0，写入报错', () => {
    const l = layer()
    expect(l.getCell(0, 0)).toBe(0)
    l.setCell(3, 2, 7)
    expect(l.getCell(3, 2)).toBe(7)
    expect([l.getCell(-1, 0), l.getCell(4, 0), l.getCell(0, 3), l.getCell(0.5, 0)]).toEqual([0, 0, 0, 0])
    expect(() => l.setCell(4, 0, 1)).toThrow(/outside the map \(4×3\)/)
    expect(() => l.setCell(0, 0, -1)).toThrow(/0 \(empty\) to 65535/)
    expect(() => l.setCell(0, 0, 1.5)).toThrow(/0 \(empty\) to 65535/)
    l.eraseCell(3, 2)
    expect(l.getCell(3, 2)).toBe(0)
  })

  it('初始格子按行排列；长度不对时报错', () => {
    const l = layer([1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 3])
    expect([l.getCell(0, 0), l.getCell(2, 1), l.getCell(3, 2), l.usedCellCount]).toEqual([1, 2, 3, 3])
    expect(() => layer([1, 2])).toThrow(/cells has 2 entries, expected 4×3 = 12/)
    expect(() => new TileMapLayer({ tileSet: set('layer-data'), width: 0, height: 1 })).toThrow(/positive integers/)
  })

  it('usedCellCount 随写入更新', () => {
    const l = layer()
    l.setCell(0, 0, 1)
    l.setCell(0, 0, 2)
    l.setCell(1, 0, 1)
    expect(l.usedCellCount).toBe(2)
    l.eraseCell(0, 0)
    l.eraseCell(0, 0)
    expect(l.usedCellCount).toBe(1)
  })

  it('坐标换算：局部像素 ↔ 格子', () => {
    const l = layer()
    expect(l.localToMap(v(17, 31.9))).toEqual(v(1, 1))
    expect(l.localToMap(v(-0.1, 0))).toEqual(v(-1, 0))
    expect(l.mapToLocal(v(1, 2))).toEqual(v(24, 40))
  })

  it('getUsedRect：包含所有非空格子的矩形（单位是格）', () => {
    const l = layer()
    expect(l.getUsedRect()).toMatchObject({ x: 0, y: 0, width: 0, height: 0 })
    l.setCell(1, 2, 1)
    l.setCell(3, 1, 1)
    expect(l.getUsedRect()).toMatchObject({ x: 1, y: 1, width: 3, height: 2 })
  })

  it('getCellTileData：图块属性；空格子和地图外为 null', () => {
    const l = layer([3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(l.getCellTileData(0, 0)?.data).toEqual({ breakable: true })
    expect([l.getCellTileData(1, 0), l.getCellTileData(9, 9)]).toEqual([null, null])
  })

  it('碰撞查询：按图块的碰撞类型，地图外没有碰撞', () => {
    const l = layer([1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect([0, 1, 2, 3].map((x) => l._cellCollision(x, 0))).toEqual([TILE_SOLID, TILE_ONE_WAY, TILE_EMPTY, TILE_EMPTY])
    expect([l._cellCollision(-1, 0), l._cellCollision(0, 3)]).toEqual([TILE_EMPTY, TILE_EMPTY])
  })

  it('进入树时登记、离开时注销；dump 显示大小和格子数', async () => {
    const g = await createTestGame({ main: Scene })
    const l = g.scene.add(layer([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    expect(g.tree._tileLayers).toEqual([l])
    expect(g.dump()).toContain('Ground (TileMapLayer) position=(0, 0) tileSet=layer-data.png size=4x3 cells=2')
    l.queueFree()
    g.step()
    expect(g.tree._tileLayers).toEqual([])
  })
})

describe('TileMapLayer 渲染同步', () => {
  // 默认视口 750×1334；区块 16 格 × 16px = 256px
  async function setup(name: string, width = 128, height = 16, pixelArt = false) {
    const g = await createTestGame({ main: Scene })
    const r = PixiRenderer._createForSyncTests({ pixelArt })
    const tiles = set(name)
    tiles.texture._setLoaded({}, 64, 32) // 假图片对象：4 列 × 2 行
    const l = g.scene.add(new TileMapLayer({ name: 'L', tileSet: tiles, width, height, cells: new Array<number>(width * height).fill(1) }))
    const sync = () => r.sync(g.tree)
    const meshes = () => ((l.unsafePixi as Container).children[0] as Container).children as Mesh[]
    return { g, r, l, tiles, sync, meshes }
  }

  it('只为屏幕内的区块创建 Mesh；图层移动后换一批显示', async () => {
    const { l, sync, meshes } = await setup('render-cull')
    sync()
    // x 方向 750 / 256 → 区块 0..2；y 方向地图只有 1 行区块
    expect(meshes().map((m) => [m.x, m.y])).toEqual([
      [0, 0],
      [256, 0],
      [512, 0],
    ])
    l.x = -1000 // 可见范围变成局部 x 1000..1750 → 区块 3..6
    sync()
    expect(meshes().filter((m) => m.visible).map((m) => m.x / 256)).toEqual([3, 4, 5, 6])
    expect(meshes().filter((m) => !m.visible).map((m) => m.x / 256)).toEqual([0, 1, 2])
  })

  it('顶点和 uv：格子按图块编号取图集里的位置，空格子是面积为 0 的四边形；线性采样时 uv 向内缩半个像素', async () => {
    const uvs = async (pixelArt: boolean) => {
      const { l, sync, meshes } = await setup(`render-uv-${pixelArt}`, 16, 16, pixelArt)
      l.setCell(1, 0, 6) // 第 6 个图块：第 2 行第 2 列 → 图集 (16, 16)，图集 64×32
      l.eraseCell(2, 0)
      sync()
      const g = meshes()[0]!.geometry
      expect([...g.positions.slice(8, 16)]).toEqual([16, 0, 32, 0, 32, 16, 16, 16])
      expect([...g.positions.slice(16, 24)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
      return [...g.uvs.slice(8, 16)]
    }
    expect(await uvs(true)).toEqual([16 / 64, 16 / 32, 32 / 64, 16 / 32, 32 / 64, 32 / 32, 16 / 64, 32 / 32])
    expect(await uvs(false)).toEqual([16.5 / 64, 16.5 / 32, 31.5 / 64, 16.5 / 32, 31.5 / 64, 31.5 / 32, 16.5 / 64, 31.5 / 32].map(Math.fround))
  })

  it('隐藏的图层不创建区块；重新显示后再创建', async () => {
    const { l, sync, meshes } = await setup('render-hidden')
    l.visible = false
    sync()
    expect(meshes()).toHaveLength(0)
    l.visible = true
    sync()
    expect(meshes()).toHaveLength(3)
  })

  it('改一格只重建它所在的区块；全空的区块不显示', async () => {
    const { l, sync, meshes } = await setup('render-dirty')
    sync()
    const updates = () => meshes().map((m) => m.geometry.getBuffer('aPosition')._updateID)
    const before = updates()
    l.setCell(20, 3, 2) // 区块 1
    sync()
    expect(updates().map((u, i) => u - before[i]!)).toEqual([0, 1, 0])
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) l.eraseCell(x, y)
    sync()
    expect(meshes()[0]!.visible).toBe(false)
  })

  it('图片没加载时不显示；节点移除后区块被销毁；图片卸载后区块着色器被释放', async () => {
    const { g, r, l, tiles, sync, meshes } = await setup('render-life')
    tiles.texture._unload()
    sync()
    expect(((l.unsafePixi as Container).children[0] as Container).visible).toBe(false)
    tiles.texture._setLoaded({}, 64, 32)
    sync()
    expect(r._tileShaderCount).toBe(1)
    const created = meshes()
    l.queueFree()
    g.step()
    sync()
    expect(created.every((m) => m.destroyed)).toBe(true)
    tiles.texture._unload()
    sync()
    expect(r._tileShaderCount).toBe(0)
  })

  it('父节点旋转、缩放时，裁剪范围和 Node2D.globalTransform 换算的一致', async () => {
    const g = await createTestGame({ main: Scene })
    const r = PixiRenderer._createForSyncTests()
    const tiles = set('render-rot')
    tiles.texture._setLoaded({}, 64, 32)
    const outer = g.scene.add(new Node2D({ position: v(300, 200), rotation: 0.4, scale: v(1.5, 0.5) }))
    const inner = outer.add(new Node2D({ position: v(-100, 50), rotation: -0.1, scale: v(0.8, 2) }))
    const l = inner.add(new TileMapLayer({ tileSet: tiles, width: 256, height: 256, cells: new Array<number>(256 * 256).fill(1) }))
    r.sync(g.tree)
    const inv = l.globalTransform.inverse()!
    const vis = g.tree.viewport.visibleRect
    const corners = [v(vis.left, vis.top), v(vis.right, vis.top), v(vis.left, vis.bottom), v(vis.right, vis.bottom)].map((p) => inv.apply(p))
    const range = (k: 'x' | 'y') => [Math.max(0, Math.floor(Math.min(...corners.map((p) => p[k])) / 256)), Math.min(15, Math.floor(Math.max(...corners.map((p) => p[k])) / 256))]
    const [x0, x1] = range('x')
    const [y0, y1] = range('y')
    const expected: string[] = []
    for (let y = y0!; y <= y1!; y++) for (let x = x0!; x <= x1!; x++) expected.push(`${x},${y}`)
    const visible = ((l.unsafePixi as Container).children[0] as Container).children.filter((m) => m.visible).map((m) => `${m.x / 256},${m.y / 256}`)
    expect(visible.sort()).toEqual(expected.sort())
    expect(expected.length).toBeGreaterThan(1)
  })

  it('在其他 Node2D 下面也按全局变换裁剪', async () => {
    const g = await createTestGame({ main: Scene })
    const r = PixiRenderer._createForSyncTests()
    const tiles = set('render-parent')
    tiles.texture._setLoaded({}, 64, 32)
    const world = g.scene.add(new Node2D({ position: v(-600, 0) }))
    const l = world.add(new TileMapLayer({ tileSet: tiles, width: 128, height: 16, cells: new Array<number>(128 * 16).fill(1) }))
    r.sync(g.tree)
    const visible = ((l.unsafePixi as Container).children[0] as Container).children.filter((m) => m.visible).map((m) => m.x / 256)
    expect(visible).toEqual([2, 3, 4, 5]) // 局部 x 600..1350
  })
})
