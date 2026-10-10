/**
 * 无头模拟一整局（平衡测试和调数值用）：按策略选英雄、点升级、放大招，直到胜利、失败或超时。
 * - `novice`：随机选英雄、随机点升级、不放大招；
 * - `reasonable`：先骑士再法师再弓手；升级优先质变、再点等级最低的分支、最后才拿通用；大招充满就放到怪最密的地方。
 * 用 `pnpm --filter hero-guard balance` 打印每局的详细结果（见 test/balance.test.ts）。
 */
import { v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { ULT } from '../src/config'
import type { HeroKind } from '../src/data/heroes'
import { isGeneric, type Offer } from '../src/data/skills'
import { gameOptions } from '../src/game'
import type { Battle } from '../src/scenes/Battle'

export type Strategy = 'novice' | 'reasonable'

export interface SimResult {
  seed: number
  strategy: Strategy
  won: boolean
  /** 打到第几波（失败时是输掉的那一波）。 */
  wave: number
  lives: number
  level: number
  /** 英雄阵亡次数。 */
  deaths: number
  ults: number
  /** 每波漏了几条命（`{ 5: 3 }`）。 */
  leaks: Record<number, number>
  /** 点过的技能（按顺序）。 */
  taken: string[]
  /** 游戏时间（秒）。 */
  time: number
}

const CLICK = { pointerId: 0, position: v(0, 0), localPosition: v(0, 0) }
const ORDER: HeroKind[] = ['knight', 'mage', 'archer']

/** 怪最密的地方：每只怪周围 `radius` 内的怪数，取最多的那只的位置。 */
function densest(b: Battle, radius: number): { x: number; y: number; n: number } | null {
  let best: { x: number; y: number; n: number } | null = null
  const alive = b.enemies.filter((e) => !e.dead)
  for (const e of alive) {
    let n = 0
    for (const o of alive) if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= radius * radius) n++
    if (!best || n > best.n) best = { x: e.x, y: e.y, n }
  }
  return best
}

/** 合理策略挑哪张卡：质变 > 等级最低的技能节点（同级先伤害型分支）> 通用里的伤害 / 攻速 / 血量 > 其他。 */
function pickReasonable(offers: readonly Offer[]): number {
  const score = (o: Offer) => {
    if (isGeneric(o)) return o.effect === 'damage' || o.effect === 'attackSpeed' ? 3 : o.effect === 'hp' ? 2.5 : o.effect === 'lives' ? 2 : 1
    if (o.level === 4) return 100
    return 10 - o.level
  }
  let best = 0
  offers.forEach((o, i) => {
    if (score(o) > score(offers[best]!)) best = i
  })
  return best
}

export async function simulate(seed: number, strategy: Strategy, maxMinutes = 25): Promise<SimResult> {
  const g = await createTestGame({ ...gameOptions, seed })
  const b = g.scene as Battle
  // 策略自己的随机数（和游戏的 tree.rng 分开，不影响出怪）
  let s = seed * 9301 + 49297
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  const leaks: Record<number, number> = {}
  let lives = b.lives
  let deaths = 0
  let ults = 0
  const dead = new Set<unknown>()
  const steps = maxMinutes * 60 * 60
  for (let i = 0; i < steps && b.state !== 'won' && b.state !== 'lost'; i++) {
    g.step()
    if (b.heroPicker && !b.heroPicker.isQueuedForDeletion) {
      const cards = b.heroPicker.cards.filter((c) => c.enabled)
      const card = strategy === 'novice' ? cards[Math.floor(rand() * cards.length)]! : ORDER.map((k) => cards.find((c) => c.kind === k)).find(Boolean)!
      card.clicked.emit(CLICK)
    }
    if (b.picker && !b.picker.isQueuedForDeletion) {
      const offers = b.picker.offers
      const k = strategy === 'novice' ? Math.floor(rand() * offers.length) : pickReasonable(offers)
      b.picker.cards[k]!.clicked.emit(CLICK)
    }
    if (strategy === 'reasonable' && i % 10 === 0 && b.state === 'wave') {
      if (b.canUlt('archer')) {
        const d = densest(b, ULT.rain.radius)
        if (d && d.n >= 4 && b.arrowRain(d.x, d.y)) ults++
      }
      if (b.canUlt('mage')) {
        const d = densest(b, ULT.meteor.radius)
        if (d && d.n >= 5 && b.meteor(d.x, d.y)) ults++
      }
      if (b.canUlt('knight') && b.enemies.filter((e) => !e.dead).length >= 6 && b.knightCharge()) ults++
    }
    if (b.lives !== lives) {
      leaks[b.wave] = (leaks[b.wave] ?? 0) + (lives - b.lives)
      lives = b.lives
    }
    for (const h of b.heroes) {
      if (h.dead && !dead.has(h)) {
        dead.add(h)
        deaths++
      } else if (!h.dead) dead.delete(h)
    }
  }
  return { seed, strategy, won: b.state === 'won', wave: b.wave, lives: b.lives, level: b.level, deaths, ults, leaks, taken: b.taken.map((t) => t.id), time: Math.round(g.tree.time) }
}

/** 中位数。 */
export function median(xs: number[]): number {
  const a = [...xs].sort((p, q) => p - q)
  const m = a.length >> 1
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2
}

export function describe(r: SimResult): string {
  const leaks = Object.entries(r.leaks)
    .map(([w, n]) => `w${w}:${n}`)
    .join(' ')
  return `${r.strategy} seed ${r.seed}: ${r.won ? 'WON' : 'lost'} wave ${r.wave} lives ${r.lives} level ${r.level} deaths ${r.deaths} ults ${r.ults} time ${r.time}s leaks ${leaks}`
}
