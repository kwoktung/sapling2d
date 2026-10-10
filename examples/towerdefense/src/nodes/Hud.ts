import { CanvasLayer, ColorRect, Label, Signal, Sprite2D, v } from 'sapling2d'
import { ASSETS } from '../assets'
import { HERO_KINDS, HERO_NAMES, type HeroKind } from '../skills'

const BTN_W = 210
const BTN_H = 120

/** 底部英雄栏的一个按钮：图标 + 名字和价格。点一下选中这类英雄。 */
class HeroButton extends ColorRect {
  readonly label: Label

  constructor(readonly kind: HeroKind) {
    super({ size: v(BTN_W, BTN_H), color: 0x2a3440, inputPickable: true })
    this.add(new Sprite2D({ texture: ASSETS[kind].frame(0), position: v(50, BTN_H / 2) }))
    this.label = this.add(new Label({ text: '', fontSize: 26, color: 0xffffff, align: 'left', verticalAlign: 'center', position: v(100, BTN_H / 2) }))
  }
}

/**
 * 界面层：顶部命、金币、波次；中间的提示文字；底部英雄栏。
 * 选中的按钮呼吸闪烁——引擎缺口（验证清单 Tween loop / yoyo）：Tween 不能循环，在 process 里自己算。
 */
export class Hud extends CanvasLayer {
  readonly heroSelected = new Signal<[kind: HeroKind]>()
  readonly status = new Label({ name: 'Status', text: '', fontSize: 30, color: 0xffffff, align: 'left', stroke: { color: 0x000000, width: 4 } })
  readonly round = new Label({ name: 'Round', text: '', fontSize: 30, color: 0xffe080, align: 'right', stroke: { color: 0x000000, width: 4 } })
  readonly message = new Label({ name: 'Message', text: '', fontSize: 60, color: 0xffe060, align: 'center', verticalAlign: 'center', stroke: { color: 0x000000, width: 6 } })
  readonly buttons: HeroButton[] = HERO_KINDS.map((k) => new HeroButton(k))
  selected: HeroKind = 'archer'
  private _pulse = 0

  constructor() {
    super({ name: 'Hud', layer: 10 })
  }

  override ready() {
    this.add(this.status)
    this.add(this.round)
    this.add(this.message)
    for (const b of this.buttons) {
      this.add(b)
      b.clicked.connect(() => this.select(b.kind), this)
    }
    this._layout()
    this.tree.viewport.resized.connect(() => this._layout(), this)
  }

  select(kind: HeroKind): void {
    this.selected = kind
    this.heroSelected.emit(kind)
  }

  update(gold: number, lives: number, round: number, costs: Record<HeroKind, number>): void {
    this.status.text = `命 ${lives}   金币 ${gold}`
    this.round.text = `第 ${round} 波`
    for (const b of this.buttons) {
      b.label.text = `${HERO_NAMES[b.kind]}\n${costs[b.kind]} 金`
      b.alpha = gold >= costs[b.kind] ? 1 : 0.45
    }
  }

  /** 显示一会儿提示文字；seconds <= 0 时一直显示。 */
  flash(text: string, seconds: number): void {
    this.message.text = text
    this.message.alpha = 1
    if (seconds > 0) this.message.createTween().wait(seconds).to(this.message, { alpha: 0 }, 0.3)
  }

  override process(dt: number) {
    this._pulse += dt
    const glow = 0.5 + 0.5 * Math.sin(this._pulse * 6)
    for (const b of this.buttons) {
      b.color = b.kind === this.selected ? lerpColor(0x3a5a3a, 0x5a8a4a, glow) : 0x2a3440
    }
  }

  private _layout() {
    const r = this.tree.viewport.safeRect
    this.status.position = v(r.left + 24, r.top + 24)
    this.round.position = v(r.right - 24, r.top + 24)
    this.message.position = v((r.left + r.right) / 2, r.top + r.height * 0.25)
    const gap = (r.width - BTN_W * this.buttons.length) / (this.buttons.length + 1)
    this.buttons.forEach((b, i) => (b.position = v(r.left + gap + i * (BTN_W + gap), r.bottom - BTN_H - 16)))
  }
}

function lerpColor(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}
