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

/** 骑士这一局的修正值。 */
export interface KnightMods {
  damageMul: number
  /** 对眩晕中的敌人伤害倍率。 */
  stunnedMul: number
  /** 质变：每第 4 次斩击震地（范围伤害 + 眩晕）。 */
  quake: boolean
  /** 斩击角度（弧度）、攻击距离倍率、攻击间隔倍率。 */
  arc: number
  rangeMul: number
  intervalMul: number
  /** 质变：360° 旋风斩。 */
  whirl: boolean
  /** 眩晕几率和时间；0 表示没有。 */
  stunChance: number
  stunTime: number
  /** 血量倍率、斩击吸血（造成伤害的比例）、受到的伤害倍率。 */
  hpMul: number
  lifesteal: number
  damageTakenMul: number
  /** 质变：荆棘，受到伤害的这个比例反弹给攻击者（0 表示没有）。 */
  thorns: number
}

export function knightMods(): KnightMods {
  return { damageMul: 1, stunnedMul: 1, quake: false, arc: (100 * Math.PI) / 180, rangeMul: 1, intervalMul: 1, whirl: false, stunChance: 0, stunTime: 1, hpMul: 1, lifesteal: 0, damageTakenMul: 1, thorns: 0 }
}

/** 各英雄的修正值类型。 */
export interface HeroMods {
  archer: ArcherMods
  mage: MageMods
  knight: KnightMods
}

/** 斩击的击退（像素）：只是打击感，不把怪推开（骑士要拦住它们）。 */
export const KNOCKBACK = 6
/** 震地质变：每第几次斩击、半径、伤害倍率（× 斩击伤害）、眩晕时间。 */
export const QUAKE_EVERY = 4
export const QUAKE_RADIUS = 140
export const QUAKE_MUL = 1
export const QUAKE_STUN = 0.8
/** 荆棘质变：反弹受到伤害的比例。 */
export const THORNS = 0.5

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
  branch('knight', 'smash', '重击', [
    ['斩击伤害 +30%', (m) => (m.damageMul *= 1.3)],
    ['20% 几率眩晕 1 秒', (m) => (m.stunChance = 0.2)],
    ['对眩晕中的敌人伤害 +50%', (m) => (m.stunnedMul *= 1.5)],
    ['质变：每第 4 次斩击震地，半径 140 范围伤害并眩晕 0.8 秒', (m) => (m.quake = true)],
  ]),
  branch('knight', 'whirl', '旋风', [
    ['斩击角度 +40°', (m) => (m.arc += (40 * Math.PI) / 180)],
    ['攻击距离 +25%', (m) => (m.rangeMul *= 1.25)],
    ['攻击间隔 −20%', (m) => (m.intervalMul *= 0.8)],
    ['质变：360° 旋风斩', (m) => (m.whirl = true)],
  ]),
  branch('knight', 'guard', '守护', [
    ['骑士血量 +30%', (m) => (m.hpMul *= 1.3)],
    ['斩击吸血：造成伤害的 15%', (m) => (m.lifesteal += 0.15)],
    ['受到的伤害 −15%', (m) => (m.damageTakenMul *= 0.85)],
    ['质变：荆棘，受到伤害的 50% 反弹给攻击者', (m) => (m.thorns = THORNS)],
  ]),
  branch('mage', 'lightning', '雷电', [
    ['每第 3 次攻击额外放连锁闪电（跳 2 次，每跳 60%）', (m) => (m.chainEvery = 3)],
    ['闪电多跳 1 次', (m) => m.chainJumps++],
    ['每第 2 次攻击就放，每跳保留 75%', (m) => ((m.chainEvery = 2), (m.chainFalloff = 0.75))],
    ['质变：每次攻击都放，跳跃不衰减', (m) => ((m.chainEvery = 1), (m.chainFalloff = 1))],
  ]),
]

/** 通用选项（不属于某个英雄，可以重复出现）：效果类型 + 数值，由 Battle 执行。 */
export interface GenericOption {
  id: string
  name: string
  desc: string
  effect: 'attackSpeed' | 'damage' | 'lives' | 'ultCharge' | 'xp' | 'hp'
  amount: number
}

export const GENERIC: GenericOption[] = [
  { id: 'generic.attackSpeed', name: '战意', desc: '全体英雄攻速 +10%', effect: 'attackSpeed', amount: 0.1 },
  { id: 'generic.damage', name: '锋芒', desc: '全体英雄伤害 +10%', effect: 'damage', amount: 0.1 },
  { id: 'generic.lives', name: '城墙修补', desc: '回复 3 条命', effect: 'lives', amount: 3 },
  { id: 'generic.ultCharge', name: '蓄能', desc: '大招充能速度 +25%', effect: 'ultCharge', amount: 0.25 },
  { id: 'generic.xp', name: '求知', desc: '获得的经验 +20%', effect: 'xp', amount: 0.2 },
  { id: 'generic.hp', name: '坚韧', desc: '全体英雄血量 +20%', effect: 'hp', amount: 0.2 },
]

/** 通用选项在抽卡池里的权重（技能节点是 1）。 */
export const GENERIC_WEIGHT = 0.35

/** 这一局的全局倍率（通用选项改它；每个英雄算数值时都乘上）。 */
export interface RunMods {
  attackSpeedMul: number
  damageMul: number
  ultChargeMul: number
  xpMul: number
  hpMul: number
}

export function runMods(): RunMods {
  return { attackSpeedMul: 1, damageMul: 1, ultChargeMul: 1, xpMul: 1, hpMul: 1 }
}

/** 三选一里的一个选项：某个英雄的技能节点，或通用选项。 */
export type Offer = SkillNode | GenericOption

export function isGeneric(o: Offer): o is GenericOption {
  return 'effect' in o
}

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

/**
 * 按权重随机抽 n 个不同的选项：技能节点权重 1，通用选项 `GENERIC_WEIGHT`。
 * `randf()` 返回 [0, 1)，传 tree.rng 的方法以便测试复现。
 */
export function drawOffers(nodes: readonly SkillNode[], n: number, randf: () => number, generic: readonly GenericOption[] = GENERIC): Offer[] {
  const left: { offer: Offer; weight: number }[] = [...nodes.map((offer) => ({ offer, weight: 1 })), ...generic.map((offer) => ({ offer, weight: GENERIC_WEIGHT }))]
  const out: Offer[] = []
  while (out.length < n && left.length) {
    let r = randf() * left.reduce((sum, x) => sum + x.weight, 0)
    let i = 0
    while (i < left.length - 1 && r >= left[i]!.weight) r -= left[i++]!.weight
    out.push(left.splice(i, 1)[0]!.offer)
  }
  return out
}

/** 从 `level` 级升到下一级需要的经验。 */
export function xpToNext(level: number): number {
  return 10 + 6 * level
}
