import { CanvasLayer, ColorRect, Ease, Label, NineSliceSprite, Signal, Sprite2D, v } from 'sapling2d'
import { ART_SCALE, ASSETS } from '../assets'
import { HEROES, type HeroKind } from '../data/heroes'
import { INK, INK_SOFT, panelOptions } from './ui'

const CARD_W = 600
const CARD_H = 200

/** 一张英雄卡（木框）：立绘、名字、定位。还没实现的英雄显示“敬请期待”、变暗、不能点。 */
class HeroCard extends NineSliceSprite {
  constructor(
    readonly kind: HeroKind,
    readonly enabled: boolean,
  ) {
    super(panelOptions(v(CARD_W, CARD_H), { inputPickable: enabled, selfModulate: enabled ? 0xffffff : 0x8a8a8a }))
    this.add(new Sprite2D({ texture: ASSETS.heroes.get(`${kind}_body`), position: v(108, CARD_H - 22), scale: v(ART_SCALE * 1.05, ART_SCALE * 1.05), alpha: enabled ? 1 : 0.4 }))
    this.add(new Label({ text: HEROES[kind].name, fontSize: 46, fontWeight: 'bold', color: enabled ? INK : 0x5a5048, align: 'left', position: v(210, 50) }))
    this.add(new Label({ text: enabled ? HEROES[kind].role : '敬请期待', fontSize: 30, color: enabled ? INK_SOFT : 0x5a5048, align: 'left', position: v(210, 120) }))
  }
}

/** 选英雄：开局选第一个，第 3、6 波前从剩下的里再选一个。选一张就发出 `picked` 并关闭（之后在场上点槽位放下）。 */
export class HeroPicker extends CanvasLayer {
  readonly picked = new Signal<[kind: HeroKind]>()
  readonly cards: HeroCard[] = []

  constructor(
    readonly kinds: readonly HeroKind[],
    readonly implemented: ReadonlySet<HeroKind>,
    readonly title: string,
  ) {
    super({ name: 'HeroPicker', layer: 20 })
  }

  override ready() {
    const r = this.tree.viewport.visibleRect
    this.add(new ColorRect({ position: r.position, size: r.size, color: 0x000000, alpha: 0.6, inputPickable: true }))
    const safe = this.tree.viewport.safeRect
    const cx = (safe.left + safe.right) / 2
    this.add(new Label({ text: this.title, fontSize: 52, fontWeight: 'bold', color: 0xffe060, align: 'center', position: v(cx, safe.top + 260), stroke: { color: 0x000000, width: 6 } }))
    this.kinds.forEach((kind, i) => {
      const card = this.add(new HeroCard(kind, this.implemented.has(kind)))
      const y = safe.top + 360 + i * (CARD_H + 30)
      card.position = v(cx - CARD_W / 2, y + 240)
      card.alpha = 0
      card.createTween().wait(i * 0.06).to(card, { y, alpha: 1 }, 0.3, Ease.BackOut)
      card.clicked.connect(() => this._pick(kind), this)
      this.cards.push(card)
    })
  }

  private _pick(kind: HeroKind) {
    if (this.isQueuedForDeletion) return
    this.picked.emit(kind)
    this.queueFree()
  }
}
