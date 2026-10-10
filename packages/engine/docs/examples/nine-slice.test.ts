// #region example
import { atlas, CanvasLayer, Label, NineSliceSprite, Scene, Signal, v } from 'sapling2d'
// ui.json：TexturePacker 等工具打的界面图集（边框、按钮）
import uiData from './ui.json'

const UI = atlas('ui.png', uiData)

/** 一张升级卡片：木框边框拉成卡片大小，四个角不变形；点一下发出 picked。 */
class Card extends NineSliceSprite {
  readonly picked = new Signal()

  constructor(title: string) {
    // 边框贴图 96×96，四边各 28 像素是不能拉伸的花边
    super({ texture: UI.get('panel_wood'), margins: 28, size: v(560, 180), inputPickable: true }) // 没设 hitArea：点击区域就是这个矩形
    this.add(new Label({ text: title, fontSize: 40, align: 'center', verticalAlign: 'center', position: v(280, 90) }))
    this.clicked.connect(() => this.picked.emit(), this)
  }
}

export class Shop extends Scene {
  static override assets = { ui: UI }
  card!: Card
  picks = 0

  override ready() {
    const hud = this.add(new CanvasLayer())
    this.card = hud.add(new Card('多重箭'))
    this.card.position = v(95, 500) // 原点在左上角
    this.card.picked.connect(() => this.picks++, this)
  }
}
// #endregion

// #region test
import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('nine slice', async () => {
  const g = await createTestGame({ main: Shop })
  g.tap(375, 590) // 卡片中间
  g.tap(375, 700) // 卡片外面
  expect(g.scene.picks).toBe(1)
  expect(g.dump()).toContain('Card (Card) position=(95, 500) texture=ui.png#panel_wood size=(560, 180) margins=28')
})
// #endregion
