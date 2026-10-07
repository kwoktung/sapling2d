import type { Container, Text } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { Label, Scene, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { PixiRenderer } from '../src/render/PixiRenderer'

const textOf = (label: Label) => (label.unsafePixi as Container).children[0] as Text

describe('Label', () => {
  it('无头模式：不渲染，dump 里能看到文字（带空格时加引号）', async () => {
    class Main extends Scene {
      override ready() {
        this.add(new Label({ name: 'Score', text: 'Score: 0', fontSize: 48, align: 'center', position: v(375, 100) }))
      }
    }
    const g = await createTestGame({ main: Main })
    const label = g.scene.children[0] as Label
    expect(label.unsafePixi).toBeNull()
    expect(g.dump()).toContain('Score (Label) position=(375, 100) text="Score: 0" fontSize=48 align=center')
  })

  it('改 text 后下一次同步更新；只改变换时不重建样式（避免重绘文字贴图）', async () => {
    const g = await createTestGame({ main: Scene })
    const r = PixiRenderer._createForSyncTests()
    const label = g.scene.add(new Label({ text: '0', fontSize: 40, color: 0xff0000, stroke: { color: 0x000000, width: 4 } }))
    r.sync(g.tree)
    const text = textOf(label)
    expect(text.text).toBe('0')
    expect(text.style.fontSize).toBe(40)
    const style = text.style

    label.text = '1'
    label.x = 100
    r.sync(g.tree)
    expect(text.text).toBe('1')
    expect(text.style).toBe(style) // 同一个样式对象：没有重建

    label.fontSize = 60
    r.sync(g.tree)
    expect(text.style.fontSize).toBe(60)
  })

  it('align / verticalAlign 决定文字相对 position 的锚点', async () => {
    const g = await createTestGame({ main: Scene })
    const r = PixiRenderer._createForSyncTests()
    const label = g.scene.add(new Label({ text: 'Hi', align: 'center', verticalAlign: 'bottom' }))
    r.sync(g.tree)
    expect([textOf(label).anchor.x, textOf(label).anchor.y]).toEqual([0.5, 1])
    label.align = 'right'
    label.verticalAlign = 'top'
    r.sync(g.tree)
    expect([textOf(label).anchor.x, textOf(label).anchor.y]).toEqual([1, 0])
  })

  it('文字分辨率 = 渲染分辨率 × 视口缩放，屏幕变化后跟着更新', async () => {
    const g = await createTestGame({ main: Scene, screen: { width: 402, height: 874, pixelRatio: 3 } })
    const r = PixiRenderer._createForSyncTests()
    const label = g.scene.add(new Label({ text: 'Hi' }))
    r.sync(g.tree)
    expect(textOf(label).resolution).toBeCloseTo(2 * (402 / 750))

    g.setScreen({ width: 1500, height: 2668, pixelRatio: 1 })
    r.sync(g.tree)
    expect(textOf(label).resolution).toBeCloseTo(2)
  })
})
