import type { Container, Sprite, Text } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { Label, Node, Node2D, Scene, Sprite2D, tex, v } from 'sapling2d'
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

  it('alpha / modulate 写到容器上（Pixi 会乘到子对象），selfModulate 只写到内容层', async () => {
    const { g, sync } = await setup()
    const s = g.scene.add(new Sprite2D({ name: 'S', texture: tex('s.png'), alpha: 0.5, modulate: 0xff8080 }))
    const label = s.add(new Label({ name: 'L', text: 'hi', selfModulate: 0x00ff00 }))
    sync()
    const c = view(s)!
    const sprite = c.children[0] as Sprite
    expect([c.alpha, c.tint, sprite.tint]).toEqual([0.5, 0xff8080, 0xffffff])
    expect((view(label)!.children[0] as Text).tint).toBe(0x00ff00)
    expect(view(label)!.tint).toBe(0xffffff)

    s.alpha = 1
    s.selfModulate = 0x808080
    sync()
    expect([c.alpha, sprite.tint]).toEqual([1, 0x808080])
  })
})

describe('alpha / modulate', () => {
  it('截断到合法范围；不是默认值时出现在 dump 里', async () => {
    const g = await createTestGame({ main: Scene })
    const n = g.scene.add(new Node2D({ name: 'N', alpha: 2, modulate: 0x1000000 }))
    expect([n.alpha, n.modulate, n.selfModulate]).toEqual([1, 0xffffff, 0xffffff])
    n.alpha = -1
    n.modulate = 0xff6666
    n.selfModulate = 0x0000ff
    expect(n.alpha).toBe(0)
    expect(g.dump()).toContain('N (Node2D) position=(0, 0) alpha=0 modulate=#ff6666 selfModulate=#0000ff')
  })
})
