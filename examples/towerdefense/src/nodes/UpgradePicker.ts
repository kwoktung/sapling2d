import { CanvasLayer, ColorRect, Ease, Label, Signal, v } from 'sapling2d'
import type { Upgrade } from '../skills'

const CARD_W = 560
const CARD_H = 200

/** 一张升级卡片：标题 + 说明，点一下选中。 */
class Card extends ColorRect {
  constructor(readonly upgrade: Upgrade) {
    super({ size: v(CARD_W, CARD_H), color: 0x2c2440, inputPickable: true })
    this.add(new ColorRect({ size: v(CARD_W, 6), color: 0xffc040 }))
    this.add(new Label({ text: upgrade.title, fontSize: 44, fontWeight: 'bold', color: 0xffe080, align: 'center', position: v(CARD_W / 2, 40) }))
    this.add(new Label({ text: upgrade.desc, fontSize: 30, color: 0xffffff, align: 'center', position: v(CARD_W / 2, 120) }))
  }
}

/**
 * 波次之间的三选一：半透明遮罩挡住下面的点击，三张卡片从下往上弹出，选一张就关闭。
 * 引擎缺口（验证清单 UI 组件）：卡片是 ColorRect + Label 拼的，没有九宫格、圆角、按下状态；
 * 卡片的呼吸效果（Tween loop）在 process 里自己算。
 */
export class UpgradePicker extends CanvasLayer {
  readonly picked = new Signal<[upgrade: Upgrade]>()
  readonly cards: Card[] = []
  private _time = 0

  constructor(readonly upgrades: readonly Upgrade[]) {
    super({ name: 'UpgradePicker', layer: 20 })
  }

  override ready() {
    const r = this.tree.viewport.visibleRect
    // 遮罩：可点击，吃掉卡片以外的点击（不会点到下面的槽位）
    this.add(new ColorRect({ position: r.position, size: r.size, color: 0x000000, alpha: 0.6, inputPickable: true }))
    const safe = this.tree.viewport.safeRect
    const cx = (safe.left + safe.right) / 2
    this.add(new Label({ text: '选择一个升级', fontSize: 48, color: 0xffffff, align: 'center', position: v(cx, safe.top + 250), stroke: { color: 0x000000, width: 5 } }))
    this.upgrades.forEach((u, i) => {
      const card = this.add(new Card(u))
      const y = safe.top + 360 + i * (CARD_H + 40)
      card.position = v(cx - CARD_W / 2, y + 300)
      card.alpha = 0
      card.createTween().wait(i * 0.08).to(card, { y, alpha: 1 }, 0.35, Ease.BackOut)
      card.clicked.connect(() => this._pick(u), this)
      this.cards.push(card)
    })
  }

  override process(dt: number) {
    this._time += dt
    for (let i = 0; i < this.cards.length; i++) {
      this.cards[i]!.color = (0x2c + Math.round(10 * (0.5 + 0.5 * Math.sin(this._time * 3 + i)))) * 0x10000 + 0x2440
    }
  }

  private _pick(u: Upgrade) {
    if (this.isQueuedForDeletion) return
    this.picked.emit(u)
    this.queueFree()
  }
}
