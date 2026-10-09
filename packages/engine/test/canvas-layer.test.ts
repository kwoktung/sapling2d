import type { Container } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { Camera2D, CanvasLayer, CharacterBody2D, CollisionShape2D, Label, Node2D, Rect2, rectangle, RigidBody2D, Scene, TileMapLayer, tileset, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { PixiRenderer } from '../src/render/PixiRenderer'

// 默认视口：设计 750×1334，屏幕 750×1334，缩放 1

async function setup(build: (scene: Scene) => void) {
  class Main extends Scene {
    override ready() {
      build(this)
    }
  }
  const g = await createTestGame({ main: Main })
  g.step()
  return g
}

const box = (name: string, position: { x: number; y: number }, log: string[]) => {
  const n = new Node2D({ name, position: v(position.x, position.y), inputPickable: true, hitArea: new Rect2(-50, -50, 100, 100) })
  n.pointerDown.connect((e) => log.push(`${name} ${e.position.x},${e.position.y}`))
  return n
}

describe('CanvasLayer', () => {
  it('下面的节点用设计坐标：全局变换算到 CanvasLayer 为止，不受场景和相机影响', async () => {
    let hud!: Node2D
    const g = await setup((scene) => {
      scene.position = v(500, 500) // 场景自己平移也不影响界面层
      const layer = scene.add(new CanvasLayer())
      hud = layer.add(new Node2D({ position: v(20, 30) }))
      scene.add(new Camera2D({ position: v(5000, 5000) }))
    })
    expect(hud.globalPosition).toEqual(v(20, 30))
    expect(g.dump()).toContain('CanvasLayer (CanvasLayer) layer=1')
  })

  it('渲染：界面层不随相机平移；layer < 0 画在场景下面，>= 0 画在上面，同一层按树的顺序；visible 控制整层', async () => {
    let far!: CanvasLayer
    let hud!: CanvasLayer
    const g = await setup((scene) => {
      hud = scene.add(new CanvasLayer({ name: 'Hud', layer: 2 }))
      hud.add(new Label({ text: 'score' }))
      far = scene.add(new CanvasLayer({ name: 'Far', layer: -1 }))
      far.add(new Node2D({ name: 'Mountains' }))
      scene.add(new CanvasLayer({ name: 'Menu', layer: 2 }))
      scene.add(new CanvasLayer({ name: 'Zero', layer: 0 }))
      scene.add(new Node2D({ name: 'Player' }))
      scene.add(new Camera2D({ position: v(3000, 667) }))
    })
    const r = PixiRenderer._createForSyncTests()
    r.sync(g.tree)
    const scene = r._stage.parent!
    expect(scene.children.map((c) => c.label)).toEqual(['Far', '__world', 'Zero', 'Hud', 'Menu'])
    const hudContainer = scene.children[3] as Container
    expect([hudContainer.x, hudContainer.y]).toEqual([0, 0])
    expect(r._stage.x).toBe(375 - 3000)
    hud.visible = false
    r.sync(g.tree)
    expect(hudContainer.visible).toBe(false)
    hud.layer = -5
    r.sync(g.tree)
    expect(scene.children.map((c) => c.label)).toEqual(['Hud', 'Far', '__world', 'Zero', 'Menu'])
  })

  it('拾取：上面的界面层优先；界面层的节点按设计坐标判断，事件坐标是设计坐标', async () => {
    const log: string[] = []
    let hud!: CanvasLayer
    const g = await setup((scene) => {
      scene.add(box('World', { x: 3000, y: 2000 }, log)) // 和按钮在屏幕上的同一位置
      hud = scene.add(new CanvasLayer())
      hud.add(box('Button', { x: 375, y: 667 }, log))
      scene.add(new Camera2D({ position: v(3000, 2000) }))
    })
    g.tap(380, 667)
    expect(log).toEqual(['Button 380,667'])
    hud.visible = false // 隐藏的层不能被点中
    g.tap(380, 667)
    expect(log.at(-1)).toBe('World 3005,2000')
    hud.visible = true
    hud.layer = -1 // 在场景下面：场景里的节点优先
    g.tap(380, 667)
    expect(log.at(-1)).toBe('World 3005,2000')
  })

  it('场景切换：属于场景的 CanvasLayer 随场景销毁，Autoload 的保留', async () => {
    class Hud extends CanvasLayer {
      override ready() {
        this.add(new Label({ name: 'Score', text: '0' }))
      }
    }
    class A extends Scene {
      override ready() {
        this.add(new CanvasLayer({ name: 'Pause' })).add(new Node2D())
      }
    }
    class B extends Scene {}
    const g = await createTestGame({ main: A, autoloads: [Hud] })
    const r = PixiRenderer._createForSyncTests()
    r.sync(g.tree)
    expect(r._stage.parent!.children.map((c) => c.label)).toEqual(['__world', 'Hud', 'Pause'])
    await g.tree.changeScene(B)
    g.step()
    r.sync(g.tree)
    expect(r._stage.parent!.children.map((c) => c.label)).toEqual(['__world', 'Hud'])
    expect(g.tree.autoload(Hud).children[0]!.name).toBe('Score')
  })

  it('界面层里的 TileMapLayer 按屏幕可见范围裁剪（没有相机偏移）', async () => {
    const tiles = tileset('cl-tiles.png', { tileSize: 16 })
    tiles.texture._setLoaded({}, 64, 32)
    let layer!: TileMapLayer
    const g = await setup((scene) => {
      layer = scene.add(new CanvasLayer({ layer: -1 })).add(new TileMapLayer({ tileSet: tiles, width: 128, height: 16, cells: new Array<number>(128 * 16).fill(1) }))
      scene.add(new Camera2D({ position: v(5000, 667) }))
    })
    const r = PixiRenderer._createForSyncTests()
    r.sync(g.tree)
    const visible = ((layer.unsafePixi as Container).children[0] as Container).children.filter((m) => m.visible).map((m) => m.x / 256)
    expect(visible).toEqual([0, 1, 2])
  })
})

describe('CanvasLayer 审查修复', () => {
  it('CanvasLayer 里的刚体：写回位置时不越过 CanvasLayer，不会每步漂移', async () => {
    let body!: RigidBody2D
    const g = await setup((scene) => {
      const holder = scene.add(new Node2D({ position: v(100, 0) }))
      body = holder.add(new CanvasLayer()).add(new RigidBody2D({ position: v(50, 50) }))
      body.add(new CollisionShape2D({ shape: rectangle(10, 10) }))
    })
    g.stepSeconds(0.5)
    expect(body.x).toBeCloseTo(50, 6)
    expect(body.y).toBeGreaterThan(50) // 在下落
  })

  it('同一 layer 的层：拾取顺序和渲染顺序一致（树的先序，嵌套的紧跟外层，不看 zIndex）', async () => {
    const log: string[] = []
    const g = await setup((scene) => {
      const l1 = scene.add(new CanvasLayer({ name: 'L1' }))
      l1.add(new CanvasLayer({ name: 'L1a' })).add(box('InL1a', { x: 100, y: 100 }, log))
      scene.add(new CanvasLayer({ name: 'L2' })).add(box('InL2', { x: 100, y: 100 }, log))
      const a = scene.add(new Node2D({ name: 'A', zIndex: 1 }))
      a.add(new CanvasLayer({ name: 'La' })).add(box('InLa', { x: 500, y: 500 }, log))
      const b = scene.add(new Node2D({ name: 'B', zIndex: 0 }))
      b.add(new CanvasLayer({ name: 'Lb' })).add(box('InLb', { x: 500, y: 500 }, log))
    })
    const r = PixiRenderer._createForSyncTests()
    r.sync(g.tree)
    expect(r._stage.parent!.children.map((c) => c.label)).toEqual(['__world', 'L1', 'L1a', 'L2', 'La', 'Lb'])
    g.tap(100, 100)
    g.tap(500, 500)
    expect(log.map((l) => l.split(' ')[0])).toEqual(['InL2', 'InLb'])
  })

  it('外层 CanvasLayer 隐藏时，嵌套在里面的层也不显示、不能被点中', async () => {
    const log: string[] = []
    let outer!: CanvasLayer
    const g = await setup((scene) => {
      outer = scene.add(new CanvasLayer({ name: 'Outer' }))
      outer.add(new CanvasLayer({ name: 'Inner', layer: 3 })).add(box('Tip', { x: 100, y: 100 }, log))
    })
    outer.visible = false
    const r = PixiRenderer._createForSyncTests()
    r.sync(g.tree)
    const inner = r._stage.parent!.children.find((c) => c.label === 'Inner')!
    expect(inner.visible).toBe(false)
    g.tap(100, 100)
    expect(log).toEqual([])
  })

  it('CharacterBody2D 只和同一画布里的 TileMapLayer 碰撞', async () => {
    const tiles = tileset('cl-solid.png', { tileSize: 16, tiles: { 1: { collision: 'solid' } } })
    class Body extends CharacterBody2D {
      override physicsProcess(dt: number) {
        this.velocityY += 900 * dt
        this.moveAndSlide()
      }
    }
    let body!: Body
    const g = await setup((scene) => {
      // 界面层里的地面：不挡场景里的角色
      scene.add(new CanvasLayer()).add(new TileMapLayer({ tileSet: tiles, width: 10, height: 1, cells: new Array<number>(10).fill(1), position: v(0, 100) }))
      body = scene.add(new Body({ shape: rectangle(10, 10), position: v(40, 0) }))
    })
    g.stepSeconds(1)
    expect(body.isOnFloor).toBe(false)
    expect(body.y).toBeGreaterThan(200)
  })
})
