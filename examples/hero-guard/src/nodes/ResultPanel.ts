import { CanvasLayer, ColorRect, Ease, Label, Signal, v } from 'sapling2d'
import { HERO_KINDS, HEROES } from '../data/heroes'
import { BRANCHES, GENERIC, isGeneric, type Offer } from '../data/skills'

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

/** 结束画面：胜利 / 失败、波次、击杀、用时、最高纪录、构筑回顾、“再来一局”按钮。占位外观，13 换成九宫格边框。 */
export class ResultPanel extends CanvasLayer {
  readonly restart = new Signal()
  readonly button: ColorRect
  readonly lines: string[]

  constructor(readonly result: RunResult) {
    super({ name: 'ResultPanel', layer: 25, processMode: 'always' })
    this.lines = buildSummary(result.taken)
    this.button = new ColorRect({ name: 'Restart', size: v(320, 100), color: 0x3a7a3a, inputPickable: true })
  }

  override ready() {
    const r = this.tree.viewport.visibleRect
    this.add(new ColorRect({ position: r.position, size: r.size, color: 0x000000, alpha: 0.7, inputPickable: true }))
    const safe = this.tree.viewport.safeRect
    const cx = (safe.left + safe.right) / 2
    const res = this.result
    const panel = this.add(new ColorRect({ name: 'Panel', size: v(PANEL_W, 760), color: 0x22303a, position: v(cx - PANEL_W / 2, safe.top + 180) }))
    panel.add(new Label({ text: res.won ? '胜利！' : '失败', fontSize: 72, fontWeight: 'bold', color: res.won ? 0xffe060 : 0xff7060, align: 'center', position: v(PANEL_W / 2, 70), stroke: { color: 0x000000, width: 6 } }))
    const m = Math.floor(res.time / 60)
    const sec = Math.floor(res.time % 60)
    panel.add(new Label({ text: `第 ${res.wave} 波　击杀 ${res.kills}　用时 ${m}:${String(sec).padStart(2, '0')}`, fontSize: 32, color: 0xffffff, align: 'center', position: v(PANEL_W / 2, 160) }))
    panel.add(new Label({ text: `最高 第 ${res.bestWave} 波　胜利 ${res.wins} 次`, fontSize: 28, color: 0xa0c0d0, align: 'center', position: v(PANEL_W / 2, 210) }))
    panel.add(new Label({ text: '构筑', fontSize: 32, fontWeight: 'bold', color: 0xffe8a0, align: 'left', position: v(40, 280) }))
    this.lines.forEach((line, i) => panel.add(new Label({ text: line, fontSize: 28, color: 0xffffff, align: 'left', position: v(40, 336 + i * 52), wrapWidth: PANEL_W - 80 })))
    this.button.position = v(PANEL_W / 2 - 160, 620)
    panel.add(this.button)
    this.button.add(new Label({ text: '再来一局', fontSize: 40, fontWeight: 'bold', color: 0xffffff, align: 'center', verticalAlign: 'center', position: v(160, 50) }))
    this.button.clicked.connect(() => this.restart.emit(), this)
    panel.alpha = 0
    panel.createTween().to(panel, { alpha: 1 }, 0.3, Ease.QuadOut)
  }
}
