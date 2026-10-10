import { CanvasLayer, ColorRect, Ease, Label, NineSliceSprite, Signal, Sprite2D, v } from 'sapling2d'
import { ASSETS } from '../assets'
import { HEROES } from '../data/heroes'
import { isGeneric, type Offer } from '../data/skills'
import { INK, INK_SOFT, panelOptions } from './ui'

const CARD_W = 580
const CARD_H = 210
const ICON_X = 104
const TEXT_X = 180

/** 卡片左边的图标：技能分支 `icon_<hero>_<branch>`，通用选项 `icon_generic_<effect>`。 */
export function offerIcon(offer: Offer): string {
  if (!isGeneric(offer)) return `icon_${offer.hero}_${offer.branch}`
  // “坚韧”的图标还没生成（Gemini 额度用完了）：先借守护分支的盾牌
  return offer.effect === 'hp' ? 'icon_knight_guard' : `icon_generic_${offer.effect}`
}

/** 一张卡片（木框）：图标、英雄名 · 分支名、等级（第 4 级标“质变”，木框染金）或“通用”、效果描述。点一下选中。 */
class Card extends NineSliceSprite {
  /** 测试里按 node 取：保持旧名字。 */
  readonly node: Offer

  constructor(readonly offer: Offer) {
    const evolve = !isGeneric(offer) && offer.level === 4
    super(panelOptions(v(CARD_W, CARD_H), { inputPickable: true, selfModulate: evolve ? 0xffc890 : 0xffffff }))
    this.node = offer
    const title = isGeneric(offer) ? offer.name : `${HEROES[offer.hero].name} · ${offer.name}`
    const tag = isGeneric(offer) ? '通用' : evolve ? '质变' : `Lv ${offer.level}`
    this.add(new Sprite2D({ texture: ASSETS.ui.get(offerIcon(offer)), position: v(ICON_X, CARD_H / 2), scale: v(0.9, 0.9) }))
    this.add(new Label({ text: title, fontSize: 38, fontWeight: 'bold', color: INK, align: 'left', position: v(TEXT_X, 40) }))
    this.add(new Label({ text: tag, fontSize: 30, fontWeight: 'bold', color: evolve ? 0xc04010 : INK_SOFT, align: 'right', position: v(CARD_W - 44, 44) }))
    this.add(new Label({ text: offer.desc, fontSize: 28, color: INK_SOFT, align: 'left', position: v(TEXT_X, 108), wrapWidth: CARD_W - TEXT_X - 44 }))
  }
}

/**
 * 升级的三选一：游戏暂停（`tree.paused`），这一层 `processMode: 'always'` 照常响应点击。
 * 半透明遮罩挡住下面的点击；卡片从下往上弹出；选一张就发出 `picked` 并关闭。
 */
export class UpgradePicker extends CanvasLayer {
  readonly picked = new Signal<[offer: Offer]>()
  readonly cards: Card[] = []

  constructor(
    readonly offers: readonly Offer[],
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

  private _pick(node: Offer) {
    if (this.isQueuedForDeletion) return
    this.picked.emit(node)
    this.queueFree()
  }
}
