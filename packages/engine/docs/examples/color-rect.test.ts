// #region example
import { CanvasLayer, ColorRect, Scene, v } from 'sapling2d'

const BAR_WIDTH = 300

/** 血条：底色 + 填充，都是 ColorRect（原点在左上角，改 scale.x 就从左往右缩）。 */
class HealthBar extends ColorRect {
  readonly fill: ColorRect

  constructor() {
    super({ position: v(40, 60), size: v(BAR_WIDTH, 24), color: 0x302020 })
    this.fill = this.add(new ColorRect({ size: v(BAR_WIDTH, 24), color: 0x40d040 }))
  }

  set ratio(value: number) {
    this.fill.scale = v(Math.max(0, Math.min(1, value)), 1)
    this.fill.color = value > 0.3 ? 0x40d040 : 0xe04040 // 血少了变红
  }
}

export class Battle extends Scene {
  hp = 10
  bar!: HealthBar
  fade!: ColorRect

  override ready() {
    const hud = this.add(new CanvasLayer())
    this.bar = hud.add(new HealthBar())
    // 转场黑幕：盖住整个可见区域，透明度从 1 补间到 0
    const r = this.tree.viewport.visibleRect
    this.fade = hud.add(new ColorRect({ position: r.position, size: r.size, color: 0x000000, zIndex: 100 }))
    this.fade.createTween().to(this.fade, { alpha: 0 }, 0.5).call(() => this.fade.queueFree())
  }

  hit() {
    this.hp--
    this.bar.ratio = this.hp / 10
  }
}
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('color-rect', async () => {
  const g = await createTestGame({ main: Battle })
  // #region test
  for (let i = 0; i < 8; i++) g.scene.hit()
  expect(g.scene.bar.fill.scale.x).toBeCloseTo(0.2)
  expect(g.scene.bar.fill.color).toBe(0xe04040)
  g.stepSeconds(0.6)
  expect(g.scene.fade.isFreed).toBe(true) // 黑幕淡出后删掉
  // #endregion
})
