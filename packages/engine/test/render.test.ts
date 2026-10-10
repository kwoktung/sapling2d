import type { Container, Sprite, Text } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { ColorRect, Label, Node, Node2D, Particles2D, Scene, sheet, Sprite2D, tex, v } from 'sapling2d'
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

  it('只移动的节点只更新容器变换，不重设贴图层；外观变了才重设', async () => {
    const { g, sync } = await setup()
    const s = g.scene.add(new Sprite2D({ name: 'S', texture: tex('move.png'), selfModulate: 0x00ff00 }))
    sync()
    const sprite = view(s)!.children[0] as Sprite
    sprite.tint = 0xff0000 // 如果同步重设了贴图层，会被改回 0x00ff00
    s.x = 30
    s.rotation = 0.5
    sync()
    expect([view(s)!.x, view(s)!.rotation, sprite.tint]).toEqual([30, 0.5, 0xff0000])
    s.alpha = 0.5
    sync()
    expect(sprite.tint).toBe(0x00ff00)
  })

  it('子节点全部移走后，叶子节点的容器里也不留旧的显示对象', async () => {
    const { g, sync } = await setup()
    const a = g.scene.add(new Sprite2D({ name: 'A', texture: tex('leaf.png') }))
    const b = a.add(new Node2D({ name: 'B' }))
    sync()
    expect(labels(view(a)!)).toEqual(['__content', 'B'])
    a.remove(b)
    sync()
    expect(labels(view(a)!)).toEqual(['__content'])
    g.scene.add(b) // 移到别处：复用同一个显示对象
    sync()
    expect(labels(view(g.scene)!)).toEqual(['A', 'B'])
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

describe('blendMode', () => {
  it('写到节点容器上：inherit 跟随父容器（Pixi 的默认值），add 作用于整棵子树，子节点可以设回 normal', async () => {
    const g = await createTestGame({ main: Scene })
    const r = PixiRenderer._createForSyncTests()
    const fx = g.scene.add(new Node2D({ name: 'Fx', blendMode: 'add' }))
    const glow = fx.add(new Sprite2D({ name: 'Glow', texture: tex('blend-glow.png') }))
    const ui = fx.add(new Label({ name: 'Ui', text: 'x', blendMode: 'normal' }))
    r.sync(g.tree)
    expect([view(fx)!.blendMode, view(glow)!.blendMode, view(ui)!.blendMode]).toEqual(['add', 'inherit', 'normal'])
    expect((view(glow)!.children[0] as Sprite).blendMode).toBe('inherit') // 内容层跟随节点容器

    // 其他有内容的节点：节点容器和内容层（ParticleContainer 等）都不自己覆盖混合模式，靠 Pixi 的 groupBlendMode 继承
    const rect = fx.add(new ColorRect({ size: v(10, 10) }))
    const sparks = fx.add(new Particles2D({ texture: tex('blend-spark.png') }))
    r.sync(g.tree)
    for (const n of [rect, sparks]) expect([view(n)!.blendMode, view(n)!.children[0]!.blendMode]).toEqual(['inherit', 'inherit'])

    fx.blendMode = 'normal'
    r.sync(g.tree)
    expect(view(fx)!.blendMode).toBe('normal')
  })

  it('默认 inherit；不是默认值时出现在 dump 里；未知值报错', async () => {
    const g = await createTestGame({ main: Scene })
    const n = g.scene.add(new Node2D({ name: 'N' }))
    expect(n.blendMode).toBe('inherit')
    n.blendMode = 'add'
    expect(g.dump()).toContain('N (Node2D) position=(0, 0) blendMode=add')
    const version = n._version
    n.blendMode = 'add' // 同一个值：不触发重新同步
    expect(n._version).toBe(version)
    // @ts-expect-error 不存在的混合模式
    expect(() => (n.blendMode = 'screen')).toThrow(/unknown blendMode "screen". Expected: inherit, normal, add/)
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

describe('pixelArt', () => {
  const sync = async (pixelArt: boolean) => {
    const g = await createTestGame({ main: Scene })
    const r = PixiRenderer._createForSyncTests({ pixelArt })
    const hero = tex(`pixel-hero-${pixelArt}.png`)
    const frames = sheet(`pixel-sheet-${pixelArt}.png`, { columns: 2, rows: 1 })
    hero._setLoaded({ width: 16, height: 16 }, 16, 16) // 假图片对象：同步阶段不会上传到 GPU
    frames.texture._setLoaded({ width: 32, height: 16 }, 32, 16)
    const a = g.scene.add(new Sprite2D({ texture: hero }))
    const b = g.scene.add(new Sprite2D({ texture: frames.frame(1) }))
    const label = g.scene.add(new Label({ text: 'hi' }))
    r.sync(g.tree)
    const content = (n: Node2D) => view(n)!.children[0] as Sprite | Text
    return {
      scaleModes: [a, b].map((n) => (content(n) as Sprite).texture.source.scaleMode),
      roundPixels: [a, b, label].map((n) => content(n).roundPixels),
    }
  }

  it('打开后贴图（包括图集的帧）用最近邻采样；默认是线性采样', async () => {
    expect((await sync(true)).scaleModes).toEqual(['nearest', 'nearest'])
    expect((await sync(false)).scaleModes).toEqual(['linear', 'linear'])
  })

  it('打开后精灵的顶点对齐到物理像素（Pixi 的 roundPixels），文字不对齐；默认都不对齐', async () => {
    expect((await sync(true)).roundPixels).toEqual([true, true, false])
    expect((await sync(false)).roundPixels).toEqual([false, false, false])
  })
})
