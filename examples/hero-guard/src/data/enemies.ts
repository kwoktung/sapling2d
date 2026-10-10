/** 怪物的基础数值（第 1 波的值）和特性。纯数据：怪物之间的差别都在这里，不靠子类。 */

export type EnemyKind = 'slime' | 'bat' | 'skeleton' | 'splitter' | 'smallSlime' | 'shaman' | 'ghost' | 'slimeKing' | 'lich'

export interface EnemyBase {
  name: string
  hp: number
  /** 像素/秒。 */
  speed: number
  xp: number
  /** 越过底线扣几条命。 */
  leak: number
  /** 显示的大小（贴图缩放）。 */
  scale: number
  /** 透明度（幽灵半透明）。 */
  alpha?: number
  /** 护甲：弓箭伤害减半。 */
  armor?: boolean
  /** 近战攻击英雄：每次伤害、两次之间的秒数。飞行的怪没有（不理英雄）。 */
  attack?: { damage: number; interval: number }
  /** 飞行：不理英雄，直接沿路线飞；骑士不会追它。 */
  flying?: boolean
  /** 免疫控制：减速、冰冻、眩晕、击退、嘲讽都没用。 */
  immune?: boolean
  /** 治疗光环：每秒给半径内的其他怪回血。 */
  heal?: { perSecond: number; radius: number }
  /** 死后分裂成几只什么怪（血量按波次成长）。 */
  split?: { kind: EnemyKind; count: number }
  /** Boss：血量固定（不随波次成长）、免疫控制、出场提示、顶部血条。 */
  boss?: boolean
  /** 每隔 `every` 秒从身边召唤 `count` 只（各走一条新的随机路线）。 */
  summon?: { kind: EnemyKind; count: number; every: number }
  /** 每隔 `every` 秒复活半径内最近 `within` 秒死掉的 `kind`，每次最多 `perCast` 只，一共最多 `total` 只。 */
  revive?: { kind: EnemyKind; every: number; radius: number; within: number; perCast: number; total: number }
}

export const ENEMIES: Record<EnemyKind, EnemyBase> = {
  slime: { name: '史莱姆', hp: 40, speed: 60, xp: 1, leak: 1, scale: 1, attack: { damage: 6, interval: 1 } },
  bat: { name: '蝙蝠', hp: 18, speed: 130, xp: 1, leak: 1, scale: 1, flying: true },
  skeleton: { name: '骷髅战士', hp: 90, speed: 50, xp: 3, leak: 1, scale: 1, armor: true, attack: { damage: 12, interval: 1.2 } },
  splitter: { name: '分裂史莱姆', hp: 70, speed: 55, xp: 2, leak: 1, scale: 1.2, split: { kind: 'smallSlime', count: 2 }, attack: { damage: 8, interval: 1 } },
  smallSlime: { name: '小史莱姆', hp: 25, speed: 70, xp: 1, leak: 1, scale: 0.7, attack: { damage: 3, interval: 1 } },
  shaman: { name: '哥布林萨满', hp: 60, speed: 50, xp: 4, leak: 1, scale: 1, heal: { perSecond: 8, radius: 100 }, attack: { damage: 5, interval: 1.5 } },
  ghost: { name: '幽灵', hp: 55, speed: 75, xp: 3, leak: 1, scale: 1, alpha: 0.6, immune: true, flying: true },
  slimeKing: { name: '史莱姆王', hp: 2500, speed: 30, xp: 50, leak: 5, scale: 1, boss: true, immune: true, summon: { kind: 'slime', count: 4, every: 6 }, attack: { damage: 40, interval: 1.5 } },
  lich: {
    name: '骷髅巫妖',
    hp: 6000,
    speed: 28,
    xp: 100,
    leak: 5,
    scale: 1,
    boss: true,
    immune: true,
    armor: true,
    attack: { damage: 60, interval: 2 },
    revive: { kind: 'skeleton', every: 8, radius: 200, within: 6, perCast: 3, total: 12 },
  },
}

/** 精英：血量、经验、漏怪扣的命、攻击力都乘这些，体型放大。 */
export const ELITE = { hp: 3, xp: 3, leak: 2, scale: 1.35, attack: 2 }

/** 每波血量乘以这个数的 (波次 - 1) 次方。 */
export const HP_GROWTH = 1.12

/** 第 `wave` 波这种怪的血量：按波次成长（Boss 固定），精英 ×3。 */
export function enemyHp(kind: EnemyKind, wave: number, elite = false): number {
  const base = ENEMIES[kind]
  return Math.round(base.hp * (base.boss ? 1 : HP_GROWTH ** (wave - 1)) * (elite ? ELITE.hp : 1))
}
