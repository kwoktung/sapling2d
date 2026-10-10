import { CanvasLayer, ColorRect, Ease, Label, Signal, v } from 'sapling2d'
import { HEROES } from '../data/heroes'
import type { SkillNode } from '../data/skills'

const CARD_W = 580
const CARD_H = 210

const HERO_COLORS: Record<string, number> = { archer: 0x2f5a2a, mage: 0x4a2f6a, knight: 0x2f405a }

/** 一张卡片：英雄名 · 分支名、等级（第 4 级标“质变”）、效果描述。点一下选中。占位外观，13 换成九宫格边框。 */
class Card extends ColorRect {
  constructor(readonly node: SkillNode) {
    super({ size: v(CARD_W, CARD_H), color: HERO_COLORS[node.hero] ?? 0x2c2440, inputPickable: true })
    const evolve = node.level === 4
    this.add(new ColorRect({ size: v(CARD_W, 8), color: evolve ? 0xff8040 : 0xffc040 }))
    this.add(new Label({ text: `${HEROES[node.hero].name} · ${node.name}`, fontSize: 40, fontWeight: 'bold', color: 0xffe8a0, align: 'left', position: v(28, 34) }))
    this.add(new Label({ text: evolve ? '质变' : `Lv ${node.level}`, fontSize: 32, fontWeight: 'bold', color: evolve ? 0xff9a50 : 0xffffff, align: 'right', position: v(CARD_W - 28, 38) }))
    this.add(new Label({ text: node.desc, fontSize: 30, color: 0xffffff, align: 'left', position: v(28, 118), wrapWidth: CARD_W - 56 }))
  }
}

/**
 * 升级的三选一：游戏暂停（`tree.paused`），这一层 `processMode: 'always'` 照常响应点击。
 * 半透明遮罩挡住下面的点击；卡片从下往上弹出；选一张就发出 `picked` 并关闭。
 */
export class UpgradePicker extends CanvasLayer {
  readonly picked = new Signal<[node: SkillNode]>()
  readonly cards: Card[] = []

  constructor(
    readonly offers: readonly SkillNode[],
    readonly level: number,
  ) {
    super({ name: 'UpgradePicker', layer: 20, processMode: 'always' })
  }

  override ready() {
    const r = this.tree.viewport.visibleRect
    this.add(new ColorRect({ position: r.position, size: r.size, color: 0x000000, alpha: 0.6, inputPickable: true }))
    const safe = this.tree.viewport.safeRect
    const cx = (safe.left + safe.right) / 2
    this.add(new Label({ text: `升级！Lv ${this.level}`, fontSize: 56, fontWeight: 'bold', color: 0xffe060, align: 'center', position: v(cx, safe.top + 220), stroke: { color: 0x000000, width: 6 } }))
    this.add(new Label({ text: '选择一个强化', fontSize: 34, color: 0xffffff, align: 'center', position: v(cx, safe.top + 300), stroke: { color: 0x000000, width: 4 } }))
    this.offers.forEach((node, i) => {
      const card = this.add(new Card(node))
      const y = safe.top + 380 + i * (CARD_H + 30)
      card.position = v(cx - CARD_W / 2, y + 260)
      card.alpha = 0
      card.createTween().wait(i * 0.06).to(card, { y, alpha: 1 }, 0.3, Ease.BackOut)
      card.clicked.connect(() => this._pick(node), this)
      this.cards.push(card)
    })
  }

  private _pick(node: SkillNode) {
    if (this.isQueuedForDeletion) return
    this.picked.emit(node)
    this.queueFree()
  }
}
