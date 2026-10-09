import { CanvasLayer, ColorRect, Label, TouchJoystick, v } from 'sapling2d'
import { ASSETS } from '../assets'

const BAR_W = 260
const BAR_H = 22

/** 界面层：左上角玩家血条和刀数，右上角剩余敌人，中间的提示文字；摇杆在屏幕左半边按下的地方出现。 */
export class Hud extends CanvasLayer {
  readonly hpBack = new ColorRect({ name: 'HpBack', size: v(BAR_W, BAR_H), color: 0x2a1c1c })
  readonly hpFill = new ColorRect({ name: 'HpFill', size: v(BAR_W, BAR_H), color: 0x48d060 })
  readonly knives = new Label({ name: 'Knives', text: '', fontSize: 30, color: 0xffffff, stroke: { color: 0x000000, width: 4 } })
  readonly enemies = new Label({ name: 'Enemies', text: '', fontSize: 30, color: 0xffffff, align: 'right', stroke: { color: 0x000000, width: 4 } })
  readonly message = new Label({ name: 'Message', text: '', fontSize: 64, color: 0xffe060, align: 'center', verticalAlign: 'center', stroke: { color: 0x000000, width: 6 } })
  readonly joystick = new TouchJoystick({ actions: { left: 'left', right: 'right', up: 'up', down: 'down' }, radius: 90, texture: ASSETS.stickBase, textureKnob: ASSETS.stickKnob })

  constructor() {
    super({ name: 'Hud', layer: 10 })
  }

  override ready() {
    // 摇杆先加：画在它上面的界面元素（以后的按钮）先收到指针
    this.add(this.joystick)
    this.add(this.hpBack)
    this.hpBack.add(this.hpFill)
    this.add(this.knives)
    this.add(this.enemies)
    this.add(this.message)
    this._layout()
    this.tree.viewport.resized.connect(() => this._layout(), this)
  }

  update(hp: number, maxHp: number, knives: number, enemiesLeft: number, boss: boolean): void {
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0
    this.hpFill.scale = v(ratio, 1)
    this.hpFill.color = ratio > 0.3 ? 0x48d060 : 0xe04848
    this.knives.text = `刀 × ${knives}`
    this.enemies.text = boss ? 'Boss!' : `敌人 ${enemiesLeft}`
  }

  /** 显示一会儿提示文字（例如“Boss 出现！”）。 */
  flash(text: string, seconds: number): void {
    this.message.text = text
    this.message.alpha = 1
    this.message.createTween().wait(seconds).to(this.message, { alpha: 0 }, 0.3)
  }

  private _layout() {
    const r = this.tree.viewport.safeRect
    this.hpBack.position = v(r.left + 24, r.top + 24)
    this.knives.position = v(r.left + 24, r.top + 60)
    this.enemies.position = v(r.right - 24, r.top + 24)
    this.message.position = v((r.left + r.right) / 2, r.top + r.height * 0.3)
  }
}
