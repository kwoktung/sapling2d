import { Label } from 'sapling2d'
import { FEEL } from '../config'

/**
 * 伤害飘字：往上飘、淡出（对象池复用）。
 * 引擎缺口（验证清单 BitmapText）：Label 每次改文字都要重新栅格化一张贴图；
 * 这里只在数字变了的时候改（同一个数字的飘字不重新画），看真机上每秒几十个是否吃得消。
 */
export class FloatText extends Label {
  active = false
  private _age = 0
  private _baseY = 0

  constructor() {
    super({ text: '', fontSize: 28, fontWeight: 'bold', color: 0xffffff, stroke: { color: 0x000000, width: 4 }, align: 'center', verticalAlign: 'center', visible: false })
  }

  show(text: string, x: number, y: number, color: number): void {
    if (this.text !== text) this.text = text
    this.color = color
    this.x = x
    this.y = y
    this._baseY = y
    this._age = 0
    this.alpha = 1
    this.active = true
    this.visible = true
  }

  // 没用 Tween：每个飘字一个 Tween 会分配（iOS 上分配贵），而且池化的对象要能中途重用
  override process(dt: number) {
    if (!this.active) return
    this._age += dt
    const t = this._age / FEEL.floatTime
    if (t >= 1) {
      this.active = false
      this.visible = false
      return
    }
    this.y = this._baseY - FEEL.floatRise * (1 - (1 - t) * (1 - t))
    this.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
  }
}
