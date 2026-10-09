import { CanvasLayer, Label, v } from 'sapling2d'

const STYLE = { fontSize: 10, color: 0xffffff, fontWeight: 'bold' as const, align: 'left' as const, verticalAlign: 'top' as const, lineHeight: 12 }

/** 顶部的分数、金币、关卡名、时间，以及屏幕中间的提示。CanvasLayer：不跟随相机。只在数字变化时改文字。 */
export class Hud extends CanvasLayer {
  private readonly _score = new Label({ ...STYLE, name: 'Score' })
  private readonly _coins = new Label({ ...STYLE, name: 'Coins' })
  private readonly _world = new Label({ ...STYLE, name: 'World', text: 'WORLD\n 1-1' })
  private readonly _time = new Label({ ...STYLE, name: 'Time' })
  private readonly _message = new Label({ name: 'Message', fontSize: 16, color: 0xffffff, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 }, visible: false })
  private _shown = { score: -1, coins: -1, time: -1 }

  constructor() {
    super({ name: 'Hud', layer: 10 })
  }

  override ready() {
    for (const l of [this._score, this._coins, this._world, this._time, this._message]) this.add(l)
    this._layout()
    this.tree.viewport.resized.connect(() => this._layout(), this)
  }

  /** 按可见区域（安全区）排开：横屏时左右两边可能有刘海。 */
  private _layout() {
    const r = this.tree.viewport.safeRect
    const step = r.width / 4
    this._score.position = v(r.left + 12, r.top + 6)
    this._coins.position = v(r.left + 12 + step, r.top + 6)
    this._world.position = v(r.left + 12 + step * 2, r.top + 6)
    this._time.position = v(r.left + 12 + step * 3, r.top + 6)
    this._message.position = v(r.left + r.width / 2, r.top + r.height / 2 - 20)
  }

  update(score: number, coins: number, time: number) {
    const s = this._shown
    if (score !== s.score) this._score.text = `MARIO\n${String((s.score = score)).padStart(6, '0')}`
    if (coins !== s.coins) this._coins.text = `\n×${String((s.coins = coins)).padStart(2, '0')}`
    if (time !== s.time) this._time.text = `TIME\n ${String((s.time = time)).padStart(3, '0')}`
  }

  showMessage(text: string) {
    this._message.text = text
    this._message.visible = true
  }

  get message(): string | null {
    return this._message.visible ? this._message.text : null
  }
}
