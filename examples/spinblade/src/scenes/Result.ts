import { Label, Scene, v } from 'sapling2d'
import { ASSETS } from '../assets'
import { Arena } from './Arena'

/** 结果画面出现后多久才接受输入：避免结束时正按着的手指马上开始下一局。 */
const INPUT_DELAY = 0.5

/** 结果画面：通关或失败；点屏幕（或按空格）再来一局。 */
export class Result extends Scene {
  static override assets = ASSETS
  private _readyAt = 0

  constructor(readonly params: { cleared: boolean }) {
    super()
  }

  override ready() {
    const r = this.tree.viewport.visibleRect
    const cx = r.x + r.width / 2
    this.add(new Label({ name: 'Title', text: this.params.cleared ? '通关！' : '失败', fontSize: 96, color: this.params.cleared ? 0xffe060 : 0xff6060, align: 'center', verticalAlign: 'center', position: v(cx, 560) }))
    this.add(new Label({ name: 'Hint', text: '点击屏幕再来一局', fontSize: 36, color: 0xcccccc, align: 'center', verticalAlign: 'center', position: v(cx, 760) }))
    this._readyAt = this.tree.time + INPUT_DELAY
  }

  override process() {
    if (this.tree.time >= this._readyAt && this.tree.input.isActionJustPressed('confirm')) void this.tree.changeScene(Arena)
  }
}
