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

/** 法师这一局的修正值。 */
export interface MageMods {
  damageMul: number
  /** 爆炸半径倍率。 */
  blastMul: number
  /** 质变：落地留下燃烧地面。 */
  burnGround: boolean
  /** 减速：比例（0–1）和时间；0 表示没有寒冰。 */
  slowPct: number
  slowTime: number
  /** 质变：2 秒内被打 3 次就冰冻。 */
  freeze: boolean
  /** 连锁闪电：每第几次攻击放一次（0 表示没有）、跳几次、每跳伤害保留多少。 */
  chainEvery: number
  chainJumps: number
  chainFalloff: number
}

export function mageMods(): MageMods {
  return { damageMul: 1, blastMul: 1, burnGround: false, slowPct: 0, slowTime: 1.5, freeze: false, chainEvery: 0, chainJumps: 2, chainFalloff: 0.6 }
}

/** 各英雄的修正值类型（骑士在 07 加）。 */
export interface HeroMods {
  archer: ArcherMods
  mage: MageMods
}

export const BURN_TIME = 2
export const BURN_DPS = 8
export const FREEZE_HITS = 3
export const FREEZE_WINDOW = 2
export const FREEZE_TIME = 1.5
/** 闪电跳到下一个目标的最远距离。 */
export const CHAIN_RANGE = 170

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
  branch('mage', 'fire', '烈焰', [
    ['火球伤害 +25%', (m) => (m.damageMul *= 1.25)],
    ['爆炸半径 +30%', (m) => (m.blastMul *= 1.3)],
    ['火球伤害 +25%', (m) => (m.damageMul *= 1.25)],
    ['质变：落地留下燃烧地面（2 秒，每秒 8 点）', (m) => (m.burnGround = true)],
  ]),
  branch('mage', 'frost', '寒冰', [
    ['爆炸使敌人减速 30%，持续 1.5 秒', (m) => (m.slowPct = 0.3)],
    ['减速提高到 45%', (m) => (m.slowPct = 0.45)],
    ['减速持续 2.5 秒', (m) => (m.slowTime = 2.5)],
    ['质变：2 秒内被打 3 次就冰冻 1.5 秒', (m) => (m.freeze = true)],
  ]),
  branch('mage', 'lightning', '雷电', [
    ['每第 3 次攻击额外放连锁闪电（跳 2 次，每跳 60%）', (m) => (m.chainEvery = 3)],
    ['闪电多跳 1 次', (m) => m.chainJumps++],
    ['每第 2 次攻击就放，每跳保留 75%', (m) => ((m.chainEvery = 2), (m.chainFalloff = 0.75))],
    ['质变：每次攻击都放，跳跃不衰减', (m) => ((m.chainEvery = 1), (m.chainFalloff = 1))],
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
