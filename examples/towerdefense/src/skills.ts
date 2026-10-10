/** 英雄的数值和技能升级（纯数据，不依赖引擎）。 */

export type HeroKind = 'archer' | 'mage' | 'knight'

export const HERO_KINDS: readonly HeroKind[] = ['archer', 'mage', 'knight']

/** 一类英雄的当前数值：升级改的就是它，同类英雄全体生效。 */
export interface HeroStats {
  cost: number
  damage: number
  /** 两次攻击之间的秒数。比攻击动画短时动画加速播放。 */
  interval: number
  range: number
  /** 弓手：一次射几支箭（打不同的目标）。 */
  arrows: number
  /** 法师：爆炸半径。 */
  blast: number
  /** 剑士：斩击的扇形角度（弧度）。 */
  arc: number
}

export const HERO_NAMES: Record<HeroKind, string> = { archer: '弓手', mage: '法师', knight: '剑士' }

export function baseStats(): Record<HeroKind, HeroStats> {
  return {
    archer: { cost: 50, damage: 10, interval: 0.8, range: 320, arrows: 1, blast: 0, arc: 0 },
    mage: { cost: 80, damage: 14, interval: 1.6, range: 280, arrows: 0, blast: 70, arc: 0 },
    knight: { cost: 60, damage: 20, interval: 1.1, range: 150, arrows: 0, blast: 0, arc: (100 * Math.PI) / 180 },
  }
}

/**
 * 攻击动画：sheet 的第 2–5 帧，每帧时长不同（前摇、蓄力、出手、收招），出手帧（动画里的第 2 帧）结算伤害。
 * 三种英雄共用同一套节奏，只是贴图不同。
 */
export const ATTACK = {
  durations: [0.08, 0.16, 0.06, 0.14],
  hitFrame: 2,
}

export interface Upgrade {
  id: string
  /** 只出现在场上已经有这类英雄的时候；undefined 表示所有英雄。 */
  kind?: HeroKind
  title: string
  desc: string
  apply(stats: Record<HeroKind, HeroStats>): void
}

const each = (stats: Record<HeroKind, HeroStats>, fn: (s: HeroStats) => void) => HERO_KINDS.forEach((k) => fn(stats[k]))

export const UPGRADES: readonly Upgrade[] = [
  { id: 'all-damage', title: '磨利武器', desc: '所有英雄伤害 +20%', apply: (s) => each(s, (h) => (h.damage *= 1.2)) },
  { id: 'all-speed', title: '战吼', desc: '所有英雄攻速 +15%', apply: (s) => each(s, (h) => (h.interval /= 1.15)) },
  { id: 'archer-multi', kind: 'archer', title: '多重箭', desc: '弓手每次多射 1 支箭', apply: (s) => s.archer.arrows++ },
  { id: 'archer-speed', kind: 'archer', title: '连射', desc: '弓手攻速 +35%', apply: (s) => (s.archer.interval /= 1.35) },
  { id: 'archer-range', kind: 'archer', title: '鹰眼', desc: '弓手射程 +25%', apply: (s) => (s.archer.range *= 1.25) },
  { id: 'mage-blast', kind: 'mage', title: '烈焰', desc: '法师爆炸半径 +30%', apply: (s) => (s.mage.blast *= 1.3) },
  { id: 'mage-damage', kind: 'mage', title: '奥术增幅', desc: '法师伤害 +40%', apply: (s) => (s.mage.damage *= 1.4) },
  { id: 'knight-arc', kind: 'knight', title: '横扫', desc: '剑士斩击角度 +40°', apply: (s) => (s.knight.arc += (40 * Math.PI) / 180) },
  { id: 'knight-damage', kind: 'knight', title: '重剑', desc: '剑士伤害 +35%', apply: (s) => (s.knight.damage *= 1.35) },
  { id: 'knight-range', kind: 'knight', title: '长柄', desc: '剑士攻击距离 +30%', apply: (s) => (s.knight.range *= 1.3) },
]

/** 从可用的升级里随机抽 n 个不同的（`pick(n)` 返回 [0, n) 的整数，传入 tree.rng 的方法以便测试复现）。 */
export function drawUpgrades(placed: ReadonlySet<HeroKind>, n: number, pick: (max: number) => number): Upgrade[] {
  const pool = UPGRADES.filter((u) => !u.kind || placed.has(u.kind))
  const out: Upgrade[] = []
  while (out.length < n && pool.length) out.push(pool.splice(pick(pool.length), 1)[0]!)
  return out
}
