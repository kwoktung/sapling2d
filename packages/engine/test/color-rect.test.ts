import { Texture as PixiTexture, type Container, type Sprite } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { CanvasLayer, ColorRect, Ease, Rect2, Scene, Sprite2D, tex, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { PixiRenderer } from '../src/render/PixiRenderer'

const content = (n: ColorRect) => (n.unsafePixi as Container).children[0] as Sprite

async function setup() {
  const g = await createTestGame({ main: Scene })
  const r = PixiRenderer._createForSyncTests()
  return { g, r, sync: () => r.sync(g.tree) }
}

describe('ColorRect', () => {
  it('默认值；构造参数；颜色截断到 0x000000–0xffffff', () => {
    const a = new ColorRect()
    expect([a.size, a.color]).toEqual([v(0, 0), 0xffffff])
    const b = new ColorRect({ size: v(300, 24), color: 0xe04040, alpha: 0.5, position: v(10, 20) })
    expect([b.size, b.color, b.alpha, b.position]).toEqual([v(300, 24), 0xe04040, 0.5, v(10, 20)])
    b.color = -5
    expect(b.color).toBe(0)
    b.color = 0x1ffffff
    expect(b.color).toBe(0xffffff)
    expect(b.rect).toEqual(new Rect2(0, 0, 300, 24))
  })

  it('补间：color 按 RGB 通道插值，size 按向量插值', async () => {
    const { g } = await setup()
    const bar = g.scene.add(new ColorRect({ size: v(100, 10), color: 0xff0000 }))
    bar.createTween().to(bar, { color: 0x0000ff, size: v(200, 30) }, 1, Ease.Linear)
    g.stepSeconds(0.5)
    // 按通道：红 255 → 0、蓝 0 → 255，中间是 (128, 0, 128)；按数字插值会得到毫无关系的颜色
    const [r, gr, b] = [(bar.color >> 16) & 0xff, (bar.color >> 8) & 0xff, bar.color & 0xff]
    expect(Math.abs(r - 128)).toBeLessThanOrEqual(1)
    expect(gr).toBe(0)
    expect(Math.abs(b - 128)).toBeLessThanOrEqual(1)
    expect(bar.size.x).toBeCloseTo(150)
    expect(bar.size.y).toBeCloseTo(20)
  })

  it('点击区域：没有 hitArea 时是矩形本身（原点在左上角），无头模式下也是', async () => {
    const { g } = await setup()
    let clicks = 0
    const button = g.scene.add(new ColorRect({ position: v(100, 100), size: v(200, 80), inputPickable: true }))
    button.clicked.connect(() => clicks++)
    g.tap(110, 110)
    g.tap(299, 179)
    g.tap(90, 110) // 左边外面
    g.tap(200, 181) // 下面外面
    expect(clicks).toBe(2)
    button.hitArea = new Rect2(-50, -50, 50, 50)
    g.tap(60, 60)
    g.tap(110, 110)
    expect(clicks).toBe(3)
  })

  it('dump 显示 size 和 color', async () => {
    const { g } = await setup()
    g.scene.add(new ColorRect({ name: 'Hp', size: v(300, 24), color: 0xe04040 }))
    expect(g.dump()).toContain('Hp (ColorRect) position=(0, 0) size=(300, 24) color=#e04040')
  })

  it('渲染：白色贴图染色，左上角对齐，宽高等于 size；颜色乘上 selfModulate；改了才更新', async () => {
    const { g, sync } = await setup()
    const bar = g.scene.add(new ColorRect({ size: v(300, 24), color: 0xe04040 }))
    sync()
    const s = content(bar)
    expect(s.texture).toBe(PixiTexture.WHITE)
    expect([s.anchor.x, s.anchor.y, s.x, s.y]).toEqual([0, 0, 0, 0])
    expect([s.width, s.height]).toEqual([300, 24])
    expect(s.tint).toBe(0xe04040)

    bar.size = v(150, 24)
    bar.selfModulate = 0x808080 // 每个通道乘 128/255
    sync()
    expect(content(bar)).toBe(s)
    expect(s.width).toBe(150)
    expect(s.tint).toBe(0x702020)

    bar.size = v(0, 0) // 宽高为 0：不显示，也不报错
    sync()
    expect([s.width, s.height]).toEqual([0, 0])
  })

  it('子节点画在矩形上面；和贴图按 zIndex 混排；在 CanvasLayer 里也能用', async () => {
    const { g, sync } = await setup()
    const hud = g.scene.add(new CanvasLayer())
    const back = hud.add(new ColorRect({ name: 'Back', size: v(100, 20), color: 0x222222 }))
    const fill = back.add(new ColorRect({ name: 'Fill', size: v(60, 20), color: 0x40e040 }))
    const icon = hud.add(new Sprite2D({ name: 'Icon', texture: tex('icon.png'), zIndex: -1 }))
    sync()
    const container = back.unsafePixi as Container
    expect(container.children[0]).toBe(content(back)) // 自己的矩形在最底层
    expect(container.children[1]).toBe(fill.unsafePixi)
    expect([(icon.unsafePixi as Container).zIndex, container.zIndex]).toEqual([-1, 0])
  })
})
