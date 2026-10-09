import { Label, Scene, Sprite2D, v } from 'sapling2d'
import { ASSETS } from '../assets'
import { Background } from '../nodes/Background'
import { BattleScene } from './BattleScene'

/** 标题：游戏名、最高分；点击（或空格 / 回车）开始。 */
export class TitleScene extends Scene {
  static override assets = ASSETS
  private _hint!: Label
  private _ship!: Sprite2D

  override ready() {
    this.add(new Background({ name: 'Background' }))
    this.add(new Label({ name: 'Title', text: '飞机大战', fontSize: 120, fontWeight: 'bold', color: 0xffffff, stroke: { color: 0x2050a0, width: 10 }, align: 'center', verticalAlign: 'center', position: v(375, 380) }))
    const best = this.tree.storage.get('best', 0)
    this.add(new Label({ name: 'Best', text: `最高分 ${best}`, fontSize: 40, color: 0xaee6ff, align: 'center', verticalAlign: 'center', position: v(375, 500) }))
    this._ship = this.add(new Sprite2D({ name: 'Ship', texture: ASSETS.sprites.get('player'), position: v(375, 760), scale: v(1.4, 1.4) }))
    this._hint = this.add(new Label({ name: 'Hint', text: '点击屏幕开始', fontSize: 44, color: 0xffffff, align: 'center', verticalAlign: 'center', position: v(375, 1000) }))
    this.add(new Label({ name: 'Help', text: '拖动战机躲避子弹 · 吃绿色道具升级火力', fontSize: 28, color: 0x8899bb, align: 'center', verticalAlign: 'center', position: v(375, 1080) }))
  }

  override process() {
    const t = this.tree.time
    this._hint.alpha = 0.6 + 0.4 * Math.sin(t * 4)
    this._ship.y = 760 + Math.sin(t * 2) * 12
    if (this.tree.input.isActionJustPressed('start')) void this.tree.changeScene(BattleScene)
  }
}
