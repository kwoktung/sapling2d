import { CanvasLayer, ColorRect, Label, v } from 'sapling2d'

const XP_W = 300
const XP_H = 14

/** 界面层：顶部的命和波次、屏幕中间的提示文字（占位，13 换成正式界面）。 */
export class Hud extends CanvasLayer {
  readonly lives = new Label({ name: 'Lives', text: '', fontSize: 32, color: 0xffffff, align: 'left', stroke: { color: 0x000000, width: 4 } })
  readonly wave = new Label({ name: 'Wave', text: '', fontSize: 32, color: 0xffe080, align: 'right', stroke: { color: 0x000000, width: 4 } })
  readonly message = new Label({ name: 'Message', text: '', fontSize: 60, color: 0xffe060, align: 'center', verticalAlign: 'center', stroke: { color: 0x000000, width: 6 } })
  readonly level = new Label({ name: 'Level', text: '', fontSize: 28, color: 0xa0e0ff, align: 'left', verticalAlign: 'center', stroke: { color: 0x000000, width: 4 } })
  readonly xpBack = new ColorRect({ name: 'XpBack', size: v(XP_W, XP_H), color: 0x1a2a3a })
  readonly xpFill = new ColorRect({ name: 'XpFill', size: v(XP_W, XP_H), color: 0x60c0ff })

  constructor() {
    super({ name: 'Hud', layer: 10 })
  }

  override ready() {
    this.add(this.lives)
    this.add(this.wave)
    this.add(this.message)
    this.add(this.level)
    this.add(this.xpBack)
    this.xpBack.add(this.xpFill)
    this._layout()
    this.tree.viewport.resized.connect(() => this._layout(), this)
  }

  update(lives: number, wave: number, total: number): void {
    this.lives.text = `命 ${lives}`
    this.wave.text = `第 ${wave} / ${total} 波`
  }

  /** 等级和这一级的经验进度（0–1）。 */
  updateXp(level: number, ratio: number): void {
    this.level.text = `Lv ${level}`
    this.xpFill.scale = v(Math.max(0, Math.min(1, ratio)), 1)
  }

  /** 显示一会儿提示文字；seconds <= 0 时一直显示。 */
  flash(text: string, seconds: number): void {
    this.message.text = text
    this.message.alpha = 1
    if (seconds > 0) this.message.createTween().wait(seconds).to(this.message, { alpha: 0 }, 0.3)
  }

  private _layout() {
    const r = this.tree.viewport.safeRect
    this.lives.position = v(r.left + 24, r.top + 24)
    this.wave.position = v(r.right - 24, r.top + 24)
    this.level.position = v(r.left + 24, r.top + 92)
    this.xpBack.position = v(r.left + 100, r.top + 92 - XP_H / 2)
    this.message.position = v((r.left + r.right) / 2, r.top + r.height * 0.3)
  }
}
