import type { Container, Sprite } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { Node, Node2D, Scene, Sprite2D, tex, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { PixiRenderer } from '../src/render/PixiRenderer'

const view = (n: Node2D) => n.unsafePixi as Container | null
const labels = (c: Container) => c.children.map((x) => x.label)

describe('headless', () => {
  it('无头模式下 Sprite2D 不创建显示对象，但出现在 dump 里', async () => {
    class Main extends Scene {
      override ready() {
        this.add(new Sprite2D({ name: 'Logo', texture: tex('logo.png'), position: v(10, 20) }))
      }
    }
    const g = await createTestGame({ main: Main })
    g.step(5)
    const logo = g.scene.children[0] as Sprite2D
    expect(logo.unsafePixi).toBeNull()
    expect(g.dump()).toContain('Logo (Sprite2D) position=(10, 20) texture=logo.png')
  })

  it('static assets 在场景 ready 之前加载完成', async () => {
    let loadedInReady = false
    class Main extends Scene {
      static override assets = { hero: tex('hero.png') }
      override ready() {
        loadedInReady = Main.assets.hero.isLoaded
      }
    }
    await createTestGame({ main: Main })
    expect(loadedInReady).toBe(true)
  })

  it('tex() 对同一路径返回同一个句柄', () => {
    expect(tex('a.png')).toBe(tex('a.png'))
    expect(tex('a.png')).not.toBe(tex('b.png'))
  })
})

describe('render sync', () => {
  async function setup() {
    const g = await createTestGame({ main: Scene })
    const r = PixiRenderer._createForSyncTests()
    return { g, r, sync: () => r.sync(g.tree) }
  }

  it('首次同步时才创建显示对象，变换随 _version 同步', async () => {
    const { g, r, sync } = await setup()
    const n = g.scene.add(new Node2D({ name: 'N', position: v(5, 6), rotation: 1, scale: v(2, 3), zIndex: 4 }))
    expect(view(n)).toBeNull()

    sync()
    const c = view(n)!
    expect([c.x, c.y, c.rotation, c.scale.x, c.scale.y, c.zIndex]).toEqual([5, 6, 1, 2, 3, 4])

    n.x = 50
    n.visible = false
    sync()
    expect(view(n)).toBe(c) // 复用同一个对象
    expect(c.x).toBe(50)
    expect(c.visible).toBe(false)
    expect(labels(r._stage)).toEqual(['Scene'])
  })

  it('层级与场景树一致；非 Node2D 节点不产生显示对象，其子节点挂到最近的 Node2D 祖先', async () => {
    const { g, sync } = await setup()
    const a = g.scene.add(new Node2D({ name: 'A' }))
    const group = a.add(new Node({ name: 'Logic' }))
    group.add(new Node2D({ name: 'B' }))
    a.add(new Node2D({ name: 'C' }))
    sync()
    expect(labels(view(g.scene)!)).toEqual(['A'])
    expect(labels(view(a)!)).toEqual(['B', 'C'])
  })

  it('节点被销毁后，下一次同步时显示对象被销毁', async () => {
    const { g, sync } = await setup()
    const a = g.scene.add(new Node2D({ name: 'A' }))
    const b = a.add(new Node2D({ name: 'B' }))
    sync()
    const c = view(a)!
    a.queueFree()
    g.step()
    sync()
    expect(view(a)).toBeNull()
    expect(view(b)).toBeNull()
    expect(c.destroyed).toBe(true)
    expect(labels(view(g.scene)!)).toEqual([])
  })

  it('子节点顺序变化时重新排列', async () => {
    const { g, sync } = await setup()
    const a = g.scene.add(new Node2D({ name: 'A' }))
    g.scene.add(new Node2D({ name: 'B' }))
    sync()
    g.scene.remove(a)
    g.scene.add(a)
    sync()
    expect(labels(view(g.scene)!)).toEqual(['B', 'A'])
  })

  it('Sprite2D：贴图层在子节点之下；centered、offset、flip 作用在贴图层上', async () => {
    const { g, sync } = await setup()
    const s = g.scene.add(new Sprite2D({ name: 'S', texture: tex('s.png'), offset: v(3, 4), flipH: true }))
    s.add(new Node2D({ name: 'Child' }))
    sync()
    const c = view(s)!
    const sprite = c.children[0] as Sprite
    expect(labels(c)).toEqual(['__content', 'Child'])
    expect([sprite.anchor.x, sprite.x, sprite.y, sprite.scale.x]).toEqual([0.5, 3, 4, -1])

    s.centered = false
    sync()
    expect(sprite.anchor.x).toBe(0)
  })
})
