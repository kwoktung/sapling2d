import { CanvasLayer, ColorRect, Ease, Label, NineSliceSprite, Signal, v } from 'sapling2d'
import { HERO_KINDS, HEROES } from '../data/heroes'
import { BRANCHES, GENERIC, isGeneric, type Offer } from '../data/skills'
import { button, INK, INK_SOFT, panelOptions } from './ui'

/** 一局的结果（Battle 填好传进来）。 */
export interface RunResult {
  won: boolean
  wave: number
  kills: number
  /** 秒。 */
  time: number
  bestWave: number
  wins: number
  taken: readonly Offer[]
}

const PANEL_W = 640

/** 构筑回顾的文字：每个上场的英雄一行，列出点过的分支和等级（第 4 级写“质变”）；通用选项各选了几次。 */
export function buildSummary(taken: readonly Offer[]): string[] {
  const lines: string[] = []
  for (const hero of HERO_KINDS) {
    const parts: string[] = []
    for (const b of BRANCHES.filter((x) => x.hero === hero)) {
      const level = Math.max(0, ...taken.filter((t) => !isGeneric(t) && t.hero === hero && t.branch === b.id).map((t) => (t as { level: number }).level))
      if (level > 0) parts.push(`${b.name} ${level === 4 ? '质变' : `Lv${level}`}`)
    }
    if (parts.length) lines.push(`${HEROES[hero].name}：${parts.join('　')}`)
  }
  const generic = GENERIC.map((g) => [g.name, taken.filter((t) => t.id === g.id).length] as const).filter(([, n]) => n > 0)
  if (generic.length) lines.push(`通用：${generic.map(([name, n]) => (n > 1 ? `${name}×${n}` : name)).join('　')}`)
  if (!lines.length) lines.push('（这一局没有点技能）')
  return lines
}

/** 结束画面（木框）：胜利 / 失败、波次、击杀、用时、最高纪录、构筑回顾、“再来一局”按钮。 */
export class ResultPanel extends CanvasLayer {
  readonly restart = new Signal()
  readonly button: NineSliceSprite
  readonly lines: string[]

  constructor(readonly result: RunResult) {
    super({ name: 'ResultPanel', layer: 25, processMode: 'always' })
    this.lines = buildSummary(result.taken)
    this.button = button('再来一局', v(320, 100))
    this.button.name = 'Restart'
  }

  override ready() {
    const r = this.tree.viewport.visibleRect
    this.add(new ColorRect({ position: r.position, size: r.size, color: 0x000000, alpha: 0.7, inputPickable: true }))
    const safe = this.tree.viewport.safeRect
    const cx = (safe.left + safe.right) / 2
    const res = this.result
    const panel = this.add(new NineSliceSprite(panelOptions(v(PANEL_W, 780), { name: 'Panel', position: v(cx - PANEL_W / 2, safe.top + 180) })))
    panel.add(new Label({ text: res.won ? '胜利！' : '失败', fontSize: 72, fontWeight: 'bold', color: res.won ? 0xffd040 : 0xe05040, align: 'center', position: v(PANEL_W / 2, 80), stroke: { color: INK, width: 6 } }))
    const m = Math.floor(res.time / 60)
    const sec = Math.floor(res.time % 60)
    panel.add(new Label({ text: `第 ${res.wave} 波　击杀 ${res.kills}　用时 ${m}:${String(sec).padStart(2, '0')}`, fontSize: 32, color: INK, align: 'center', position: v(PANEL_W / 2, 170) }))
    panel.add(new Label({ text: `最高 第 ${res.bestWave} 波　胜利 ${res.wins} 次`, fontSize: 28, color: INK_SOFT, align: 'center', position: v(PANEL_W / 2, 220) }))
    panel.add(new Label({ text: '构筑', fontSize: 32, fontWeight: 'bold', color: INK, align: 'left', position: v(60, 290) }))
    this.lines.forEach((line, i) => panel.add(new Label({ text: line, fontSize: 28, color: INK_SOFT, align: 'left', position: v(60, 346 + i * 52), wrapWidth: PANEL_W - 120 })))
    this.button.position = v(PANEL_W / 2 - 160, 630)
    panel.add(this.button)
    this.button.clicked.connect(() => this.restart.emit(), this)
    panel.alpha = 0
    panel.createTween().to(panel, { alpha: 1 }, 0.3, Ease.QuadOut)
  }
}
