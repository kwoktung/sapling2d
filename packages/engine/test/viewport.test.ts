import { describe, expect, it } from 'vitest'
import { Rect2, Scene, v, Viewport } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { PixiRenderer } from '../src/render/PixiRenderer'

/** spike 里测过的 iPhone：402×874 @3x，刘海和 Home 条把安全区限制在 y∈[62, 840] */
const IPHONE = { width: 402, height: 874, pixelRatio: 3, safeArea: { left: 0, top: 62, right: 402, bottom: 840 } }
const DESIGN = { width: 750, height: 1334 }

describe('Viewport', () => {
  it('expand：等比缩放放下设计区域，多出的高度向上下对称扩展', () => {
    const vp = new Viewport(DESIGN, IPHONE)
    const scale = 402 / 750
    expect(vp.scale).toBeCloseTo(scale)
    expect(vp.offset.x).toBeCloseTo(0)
    expect(vp.offset.y).toBeCloseTo((874 - 1334 * scale) / 2)

    const vis = vp.visibleRect
    expect(vis.width).toBeCloseTo(750)
    expect(vis.height).toBeCloseTo(874 / scale)
    expect(vis.top).toBeCloseTo(-(vis.height - 1334) / 2) // 设计区域居中
    expect(vis.center.isEqualApprox(v(375, 667))).toBe(true)
  })

  it('keep：可见区域就是设计区域', () => {
    const vp = new Viewport({ ...DESIGN, aspect: 'keep' }, IPHONE)
    expect(vp.visibleRect).toEqual(new Rect2(0, 0, 750, 1334))
  })

  it('横屏的宽屏幕：左右扩展', () => {
    const vp = new Viewport(DESIGN, { width: 1600, height: 900, pixelRatio: 1 })
    expect(vp.scale).toBeCloseTo(900 / 1334)
    expect(vp.visibleRect.height).toBeCloseTo(1334)
    expect(vp.visibleRect.left).toBeLessThan(0)
    expect(vp.visibleRect.center.isEqualApprox(v(375, 667))).toBe(true)
  })

  it('窗口坐标与设计坐标互相换算', () => {
    const vp = new Viewport(DESIGN, IPHONE)
    const p = v(201, 437) // 屏幕中心
    expect(vp.screenToDesign(p).isEqualApprox(v(375, 667))).toBe(true)
    expect(vp.designToScreen(vp.screenToDesign(v(13, 57))).isEqualApprox(v(13, 57))).toBe(true)
    expect(vp.screenToDesign(v(0, 0)).isEqualApprox(vp.visibleRect.position)).toBe(true)
  })

  it('安全区换算到设计坐标，并与可见区域求交', () => {
    const vp = new Viewport(DESIGN, IPHONE)
    const safe = vp.safeRect
    expect(safe.top).toBeCloseTo(vp.screenToDesign(v(0, 62)).y)
    expect(safe.bottom).toBeCloseTo(vp.screenToDesign(v(0, 840)).y)
    expect(safe.left).toBeCloseTo(0)
    expect(safe.width).toBeCloseTo(750)
    // 没有安全区信息时等于可见区域
    const plain = new Viewport(DESIGN, { width: 402, height: 874, pixelRatio: 3 })
    expect(plain.safeRect.isEqualApprox(plain.visibleRect)).toBe(true)
  })

  it('渲染分辨率是 DPR，上限为 2', () => {
    expect(new Viewport(DESIGN, IPHONE).renderResolution).toBe(2)
    expect(new Viewport(DESIGN, { ...IPHONE, pixelRatio: 1.5 }).renderResolution).toBe(1.5)
  })
})

describe('屏幕变化', () => {
  it('无头模式可以配置屏幕；setScreen 后视口更新并触发 resized', async () => {
    const g = await createTestGame({ main: Scene, screen: IPHONE })
    const vp = g.tree.viewport
    expect(vp.screen.width).toBe(402)

    let fired = 0
    vp.resized.connect(() => fired++)
    g.setScreen({ width: 874, height: 402, pixelRatio: 3 }) // 转成横屏
    expect(fired).toBe(1)
    expect(vp.scale).toBeCloseTo(402 / 1334)
    expect(vp.visibleRect.width).toBeGreaterThan(750)
  })

  it('默认屏幕与设计分辨率相同：视口是恒等变换', async () => {
    const g = await createTestGame({ main: Scene, design: { width: 640, height: 960 } })
    const vp = g.tree.viewport
    expect(vp.scale).toBe(1)
    expect(vp.visibleRect).toEqual(new Rect2(0, 0, 640, 960))
  })

  it('渲染层把视口的缩放和平移施加到场景容器上', async () => {
    const g = await createTestGame({ main: Scene, screen: IPHONE })
    const r = PixiRenderer._createForSyncTests()
    r.sync(g.tree)
    const vp = g.tree.viewport
    const scene = r._stage.parent! // _stage 是相机平移的世界容器，视口变换在它的父容器上
    expect(scene.scale.x).toBeCloseTo(vp.scale)
    expect(scene.position.y).toBeCloseTo(vp.offset.y)

    g.setScreen({ width: 1000, height: 1334, pixelRatio: 1 })
    r.sync(g.tree)
    expect(scene.scale.x).toBeCloseTo(1)
    expect(scene.position.x).toBeCloseTo(125)
  })
})
