/** 技能树：每个英雄 3 条分支 × 4 级（第 4 级质变）；经验和升级。纯数据，不依赖引擎。 */
import type { HeroKind } from './heroes'

/** 弓手这一局的修正值（技能节点改它；英雄出手时读它）。 */
export interface ArcherMods {
  /** 一次射几支箭（打不同的目标）。 */
  arrows: number
  damageMul: number
  critChance: number
  critMul: number
  rangeMul: number
  /** 中毒：每层每秒伤害、持续时间、最多几层；0 表示没有毒箭。 */
  poisonDps: number
  poisonTime: number
  poisonStacks: number
  /** 质变：箭穿透沿途所有敌人。 */
  pierce: boolean
  /** 质变：每第 5 箭爆头（6 倍伤害、无视护甲）。 */
  headshot: boolean
  /** 质变：中毒的敌人死亡时毒雾扩散。 */
  poisonCloud: boolean
}

export function archerMods(): ArcherMods {
  return { arrows: 1, damageMul: 1, critChance: 0, critMul: 2, rangeMul: 1, poisonDps: 0, poisonTime: 3, poisonStacks: 3, pierce: false, headshot: false, poisonCloud: false }
}

/** 各英雄的修正值类型（法师、骑士在 06 / 07 加）。 */
export interface HeroMods {
  archer: ArcherMods
}

export const HEADSHOT_EVERY = 5
export const HEADSHOT_MUL = 6
export const POISON_CLOUD_RADIUS = 80
/** 毒雾给周围的敌人加几层毒。 */
export const POISON_CLOUD_STACKS = 2

export interface SkillNode<K extends keyof HeroMods = keyof HeroMods> {
  id: string
  hero: K
  branch: string
  /** 1–4；4 是质变。 */
  level: number
  name: string
  desc: string
  apply(mods: HeroMods[K]): void
}

/** 一条分支：名字和 4 个节点（按等级）。 */
export interface Branch<K extends keyof HeroMods = keyof HeroMods> {
  hero: K
  id: string
  name: string
  nodes: SkillNode<K>[]
}

function branch<K extends keyof HeroMods>(hero: K, id: string, name: string, levels: [string, (m: HeroMods[K]) => void][]): Branch<K> {
  return {
    hero,
    id,
    name,
    nodes: levels.map(([desc, apply], i) => ({ id: `${hero}.${id}.${i + 1}`, hero, branch: id, level: i + 1, name, desc, apply })),
  }
}

export const BRANCHES: Branch[] = [
  branch('archer', 'multishot', '多重箭', [
    ['多射 1 支箭（打不同的目标）', (m) => m.arrows++],
    ['再多射 1 支箭', (m) => m.arrows++],
    ['箭的伤害 +25%', (m) => (m.damageMul *= 1.25)],
    ['质变：箭穿透沿途所有敌人', (m) => (m.pierce = true)],
  ]),
  branch('archer', 'sniper', '狙击', [
    ['15% 几率暴击（2 倍伤害）', (m) => (m.critChance += 0.15)],
    ['暴击伤害提高到 2.5 倍', (m) => (m.critMul = 2.5)],
    ['暴击率 +15%，射程 +15%', (m) => ((m.critChance += 0.15), (m.rangeMul *= 1.15))],
    ['质变：每第 5 箭爆头（6 倍伤害、无视护甲）', (m) => (m.headshot = true)],
  ]),
  branch('archer', 'poison', '毒箭', [
    ['命中使敌人中毒：每秒 4 点，持续 3 秒，最多叠 3 层', (m) => (m.poisonDps = 4)],
    ['中毒最多叠 5 层', (m) => (m.poisonStacks = 5)],
    ['中毒伤害 +50%', (m) => (m.poisonDps *= 1.5)],
    ['质变：中毒的敌人死亡时毒雾扩散（半径 80）', (m) => (m.poisonCloud = true)],
  ]),
]

/** 每条分支点到第几级了：`branchLevels.get('archer.multishot')`。 */
export type BranchLevels = Map<string, number>

/** 可以出现在三选一里的节点：已上场英雄每条分支的下一级（点满的分支不再出现）。 */
export function availableNodes(placed: ReadonlySet<HeroKind>, levels: BranchLevels): SkillNode[] {
  const out: SkillNode[] = []
  for (const b of BRANCHES) {
    if (!placed.has(b.hero)) continue
    const next = b.nodes[levels.get(`${b.hero}.${b.id}`) ?? 0]
    if (next) out.push(next)
  }
  return out
}

/** 随机抽 n 个不同的节点（`pick(n)` 返回 [0, n) 的整数，传 tree.rng 的方法以便测试复现）。 */
export function drawOffers(pool: readonly SkillNode[], n: number, pick: (max: number) => number): SkillNode[] {
  const left = [...pool]
  const out: SkillNode[] = []
  while (out.length < n && left.length) out.push(left.splice(pick(left.length), 1)[0]!)
  return out
}

/** 从 `level` 级升到下一级需要的经验。 */
export function xpToNext(level: number): number {
  return 10 + 6 * level
}
