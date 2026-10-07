// #region example
import { Label, Scene, Sprite2D, tex, v } from 'sapling2d'

export class Hud extends Scene {
  // 进入场景前加载完成；路径相对于 public/assets/（sapling2d/vite 插件会检查文件是否存在）
  static override assets = { coin: tex('coin.png') }
  score = 0
  scoreLabel!: Label

  override ready() {
    this.add(new Sprite2D({ texture: Hud.assets.coin, position: v(60, 60) })) // 默认以贴图中心为 position
    this.scoreLabel = this.add(
      new Label({ text: '0', fontSize: 48, color: 0xffffff, stroke: { color: 0x000000, width: 6 }, align: 'left', verticalAlign: 'center', position: v(110, 60) }),
    )
  }

  addScore(n: number) {
    this.score += n
    this.scoreLabel.text = String(this.score) // 下一帧画面更新
  }
}
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('sprite and label', async () => {
  const g = await createTestGame({ main: Hud })
  g.scene.addScore(5)
  expect(g.dump()).toContain('text=5')
  expect(g.dump()).toContain('texture=coin.png')
})
