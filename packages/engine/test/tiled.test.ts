import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Scene, tiledMap, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { joinPath } from '../src/core/tiled'
import { TILE_ONE_WAY, TILE_SOLID } from '../src/core/tileset'

const FIXTURES = 'test/fixtures/tiled'

async function load(path: string, assetsDir = FIXTURES) {
  const level = tiledMap(path)
  class Main extends Scene {
    static override assets = { level }
  }
  const g = await createTestGame({ main: Main, assetsDir })
  return { g, level }
}

afterEach(() => vi.restoreAllMocks())

describe('tiledMap', () => {
  it('作为资源加载：读关卡和外部图块集，加载图块集的图片；地图大小和属性', async () => {
    const { level } = await load('levels/1-1.json')
    expect(level.isLoaded).toBe(true)
    expect([level.width, level.height, level.tileSize, level.pixelWidth, level.pixelHeight]).toEqual([6, 4, 16, 96, 64])
    expect(level.properties).toEqual({ music: 'overworld' })
    expect(level.tileSets.map((t) => t.texture.path)).toEqual(['tiles/terrain.png', 'tiles/sky.png'])
    expect(level.tileSets.map((t) => t.columns)).toEqual([4, 2])
    expect(level.layerNames).toEqual(['Back', 'Ground'])
  })

  it('图块集：碰撞属性和自定义字段', async () => {
    const { level } = await load('levels/1-1.json')
    const terrain = level.tileSets[0]!
    expect(terrain.tile(1).collision).toBe('solid')
    expect(terrain.tile(2)).toMatchObject({ collision: 'solid', data: { breakable: true } })
    expect(terrain.tile(3).collision).toBe('oneWay')
    expect(terrain.tile(4).collision).toBeNull()
  })

  it('图块层：格子编号换成图块集里的编号，名字、偏移、可见性、不透明度、碰撞层', async () => {
    const { level } = await load('levels/1-1.json')
    const [back, ground] = level.createLayers()
    expect([back!.name, back!.alpha, back!.tileSet]).toEqual(['Back', 0.5, level.tileSets[1]])
    expect(back!.getCell(0, 0)).toBe(1) // gid 9 → sky 的第 1 个图块
    expect([ground!.name, ground!.position, ground!.collisionLayer]).toEqual(['Ground', v(8, -4), 3])
    expect([ground!.getCell(2, 1), ground!.getCell(4, 2), ground!.getCell(0, 3), ground!.getCell(0, 0)]).toEqual([2, 3, 1, 0])
    expect([ground!._cellCollision(2, 1), ground!._cellCollision(4, 2)]).toEqual([TILE_SOLID, TILE_ONE_WAY])
    expect(level.createLayer('Ground')).not.toBe(ground) // 每次都是新节点
    expect(() => level.createLayer('Nope')).toThrow(/no tile layer named "Nope" \(tile layers: Back, Ground\)/)
  })

  it('对象层：名字、类型、位置、大小、形状、自定义属性', async () => {
    const { level } = await load('levels/1-1.json')
    const [spawn, coin, enemy] = level.objects('Entities')
    expect(spawn).toMatchObject({ name: 'start', type: 'Spawn', x: 20, y: 40, shape: 'point', layer: 'Entities' })
    expect(coin).toMatchObject({ type: 'Coin', x: 64, y: 8, width: 16, height: 16, shape: 'rectangle', properties: { value: 5 } })
    expect(enemy).toMatchObject({ type: 'Enemy', shape: 'tile', gid: 4, flipH: false, flipV: false })
    expect(enemy!.tileSet).toBe(level.tileSets[0])
    expect(coin!.tileSet).toBeNull()
    expect(level.objects()).toHaveLength(3)
    expect(() => level.objects('Nope')).toThrow(/no object layer named "Nope"/)
  })

  it('图块层的自定义属性', async () => {
    const { level } = await load('levels/1-1.json')
    expect(level.layerProperties('Ground')).toEqual({ collisionLayer: 3 })
    expect(level.layerProperties('Back')).toEqual({})
  })

  it('同一路径返回同一个句柄；没加载时访问报错', () => {
    expect(tiledMap('levels/x.tmj')).toBe(tiledMap('levels/x.tmj'))
    expect(() => tiledMap('levels/x.tmj').width).toThrow(/is not loaded yet; declare it in the scene's static assets/)
  })

  it('切换场景时卸载图块集的图片，再次进入时重新加载', async () => {
    const { g, level } = await load('levels/1-1.json')
    class Other extends Scene {}
    await g.tree.changeScene(Other)
    expect(level.tileSets[0]!.isLoaded).toBe(false)
    class Again extends Scene {
      static override assets = { level }
    }
    await g.tree.changeScene(Again)
    expect(level.isLoaded).toBe(true)
  })

  it('两个关卡共用一张图：切到另一个关卡时这张图不会被卸载', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tiled-shared-'))
    cpSync(FIXTURES, dir, { recursive: true })
    cpSync(join(dir, 'levels/1-1.json'), join(dir, 'levels/1-2.json'))
    const a = tiledMap('levels/1-1.json')
    a['_map' as never] = null as never
    class A extends Scene {
      static override assets = { level: a }
    }
    const g = await createTestGame({ main: A, assetsDir: dir })
    const b = tiledMap('levels/1-2.json')
    class B extends Scene {
      static override assets = { level: b }
    }
    await g.tree.changeScene(B)
    expect(b.tileSets[0]!.texture).toBe(a.tileSets[0]!.texture) // tex() 按路径共用
    expect(b.isLoaded).toBe(true)
  })

  it('路径拼接', () => {
    expect(joinPath('levels', '../tiles/a.png')).toBe('tiles/a.png')
    expect(joinPath('', './a.png')).toBe('a.png')
    expect(joinPath('a/b', '../../c/d.png')).toBe('c/d.png')
    expect(joinPath('levels', '../../shared/a.png')).toBeNull() // 跳出资源目录
  })
})

describe('tiledMap 不支持的特性', () => {
  /** 在临时目录里放一份改过的关卡（图块集照抄），返回目录。 */
  function variant(change: (map: Record<string, any>) => void, tileset?: (ts: Record<string, any>) => void): string {
    const dir = mkdtempSync(join(tmpdir(), 'tiled-'))
    cpSync(join(FIXTURES, 'tiles'), join(dir, 'tiles'), { recursive: true })
    mkdirSync(join(dir, 'levels'))
    writeFileSync(join(dir, 'tiles/terrain.tsx'), '<?xml version="1.0" encoding="UTF-8"?>\n<tileset name="terrain"/>') // 用来测 XML 格式的报错
    const map = JSON.parse(readFileSync(join(FIXTURES, 'levels/1-1.json'), 'utf8'))
    change(map)
    writeFileSync(join(dir, 'levels/1-1.json'), JSON.stringify(map))
    if (tileset) {
      const ts = JSON.parse(readFileSync(join(FIXTURES, 'tiles/terrain.json'), 'utf8'))
      tileset(ts)
      writeFileSync(join(dir, 'tiles/terrain.json'), JSON.stringify(ts))
    }
    return dir
  }
  const fails = (dir: string) => load('levels/1-1.json', dir).then(
    () => '',
    (e: Error) => e.message,
  )
  // 每个用例用不同的路径（句柄按路径缓存），这里把目录当成不同的资源根
  const cases: [string, (m: Record<string, any>) => void, RegExp][] = [
    ['斜视角', (m) => (m.orientation = 'isometric'), /only orthogonal maps are supported \(got "isometric"\)/],
    ['无限地图', (m) => (m.infinite = true), /infinite maps are not supported/],
    ['非正方形格子', (m) => (m.tileheight = 8), /tiles must be square/],
    ['base64 图层', (m) => ((m.layers[1].data = 'AAAA'), (m.layers[1].encoding = 'base64')), /layer "Ground": tile layer data must be CSV/],
    ['翻转的图块', (m) => (m.layers[1].data[0] = 1 + 0x80000000), /layer "Ground": flipped or rotated tiles are not supported \(cell 0, 0\)/],
    ['一个图层用两个图块集', (m) => (m.layers[1].data[0] = 9), /layer "Ground": uses more than one tileset/],
    ['图层组', (m) => m.layers.push({ type: 'group', name: 'G', layers: [] }), /layer "G": group layers are not supported/],
    ['图片图层', (m) => m.layers.push({ type: 'imagelayer', name: 'Pic' }), /layer "Pic": imagelayer layers are not supported/],
    ['多图片的图块集', (m) => delete m.tilesets[1].image, /tileset "sky": "collection of images" tilesets are not supported/],
    ['图块集格子大小不同', (m) => (m.tilesets[1].tilewidth = 8), /tileset "sky": tiles must be 16×16 like the map/],
    ['图层格子数和大小不符', (m) => m.layers[1].data.pop(), /layer "Ground": has 23 cells, expected 6×4 = 24/],
    ['图片在资源目录外', (m) => (m.tilesets[1].image = '../../../outside.png'), /tileset "sky": image "\.\.\/\.\.\/\.\.\/outside\.png" points outside the assets directory/],
    ['XML 格式的外部图块集', (m) => (m.tilesets[0].source = '../tiles/terrain.tsx'), /tiles\/terrain\.tsx" is not valid JSON; it is a Tiled XML file/],
    ['关卡文件不存在', (m) => (m.tilesets[0].source = '../tiles/missing.tsj'), /tileset "\.\.\/tiles\/missing\.tsj": cannot read "tiles\/missing\.tsj"/],
  ]
  for (const [name, change, error] of cases) {
    it(name, async () => {
      tiledMap('levels/1-1.json')['_map' as never] = null as never // 每次重新读文件
      expect(await fails(variant(change))).toMatch(error)
    })
  }

  it('碰撞编辑器里画的形状被忽略：警告', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    tiledMap('levels/1-1.json')['_map' as never] = null as never
    expect(await fails(variant(() => {}, (ts) => ts.tiles.push({ id: 5, objectgroup: { objects: [{ x: 0, y: 0, width: 16, height: 16 }] } })))).toBe('')
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/tileset "terrain": tiles 5 have collision shapes drawn in the collision editor, which are ignored; add a string property "collision"/)
  })

  it('碰撞属性的值不对；动画图块只警告', async () => {
    tiledMap('levels/1-1.json')['_map' as never] = null as never
    expect(await fails(variant(() => {}, (ts) => (ts.tiles[0].properties[0].value = 'wall')))).toMatch(/tileset "terrain": tile 0 has collision "wall"; use "solid" or "oneWay"/)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    tiledMap('levels/1-1.json')['_map' as never] = null as never
    expect(await fails(variant(() => {}, (ts) => (ts.tiles[0].animation = [{ tileid: 0, duration: 100 }])))).toBe('')
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/tileset "terrain": animated tiles are not supported yet/)
  })
})
