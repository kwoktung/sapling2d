import { Label, Scene, v } from 'sapling2d'
import { ASSETS } from '../assets'
import { Background } from '../nodes/Background'
import { BattleScene } from './BattleScene'

/** 刚进入结算时的一小段时间里不响应点击：玩家可能还在拖动，防止误触直接开了下一局。 */
const INPUT_DELAY = 0.8

/** 结算：分数、最高分、新纪录；点击再来一局。 */
export class GameOverScene extends Scene {
  static override assets = ASSETS
  private _readyAt = 0
  private _hint!: Label

  constructor(readonly params: { score: number; best: number; newRecord: boolean }) {
    super()
  }

  override ready() {
    this.add(new Background({ name: 'Background' }))
    const { score, best, newRecord } = this.params
    this.add(new Label({ name: 'Title', text: '游戏结束', fontSize: 84, fontWeight: 'bold', color: 0xffffff, align: 'center', verticalAlign: 'center', position: v(375, 420) }))
    this.add(new Label({ name: 'Score', text: String(score), fontSize: 120, fontWeight: 'bold', color: 0xffd166, stroke: { color: 0x101030, width: 8 }, align: 'center', verticalAlign: 'center', position: v(375, 600) }))
    if (newRecord) this.add(new Label({ name: 'NewRecord', text: '新纪录！', fontSize: 48, color: 0xff7aa2, align: 'center', verticalAlign: 'center', position: v(375, 720) }))
    else this.add(new Label({ name: 'Best', text: `最高分 ${best}`, fontSize: 40, color: 0xaee6ff, align: 'center', verticalAlign: 'center', position: v(375, 720) }))
    this._hint = this.add(new Label({ name: 'Hint', text: '点击屏幕再来一局', fontSize: 40, color: 0xffffff, align: 'center', verticalAlign: 'center', position: v(375, 900), alpha: 0 }))
    this._readyAt = this.tree.time + INPUT_DELAY
  }

  override process() {
    const ready = this.tree.time >= this._readyAt
    this._hint.alpha = ready ? 0.6 + 0.4 * Math.sin(this.tree.time * 4) : 0
    if (ready && this.tree.input.isActionJustPressed('start')) void this.tree.changeScene(BattleScene)
  }
}
