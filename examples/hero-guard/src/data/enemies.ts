/** 怪物的基础数值（第 1 波的值）和特性。纯数据：怪物之间的差别都在这里，不靠子类。 */

export type EnemyKind = 'slime' | 'bat' | 'skeleton' | 'splitter' | 'smallSlime' | 'shaman' | 'ghost'

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
  /** 免疫控制：减速、冰冻、眩晕、击退、嘲讽都没用。 */
  immune?: boolean
  /** 治疗光环：每秒给半径内的其他怪回血。 */
  heal?: { perSecond: number; radius: number }
  /** 死后分裂成几只什么怪（血量按波次成长）。 */
  split?: { kind: EnemyKind; count: number }
}

export const ENEMIES: Record<EnemyKind, EnemyBase> = {
  slime: { name: '史莱姆', hp: 40, speed: 60, xp: 1, leak: 1, scale: 1 },
  bat: { name: '蝙蝠', hp: 18, speed: 130, xp: 1, leak: 1, scale: 1 },
  skeleton: { name: '骷髅战士', hp: 90, speed: 50, xp: 3, leak: 1, scale: 1, armor: true },
  splitter: { name: '分裂史莱姆', hp: 70, speed: 55, xp: 2, leak: 1, scale: 1.2, split: { kind: 'smallSlime', count: 2 } },
  smallSlime: { name: '小史莱姆', hp: 25, speed: 70, xp: 1, leak: 1, scale: 0.7 },
  shaman: { name: '哥布林萨满', hp: 60, speed: 50, xp: 4, leak: 1, scale: 1, heal: { perSecond: 8, radius: 100 } },
  ghost: { name: '幽灵', hp: 55, speed: 75, xp: 3, leak: 1, scale: 1, alpha: 0.6, immune: true },
}

/** 精英：血量、经验、漏怪扣的命都乘这些，体型放大。 */
export const ELITE = { hp: 3, xp: 3, leak: 2, scale: 1.35 }

/** 每波血量乘以这个数的 (波次 - 1) 次方。 */
export const HP_GROWTH = 1.12

export function enemyHp(kind: EnemyKind, wave: number, elite = false): number {
  return Math.round(ENEMIES[kind].hp * HP_GROWTH ** (wave - 1) * (elite ? ELITE.hp : 1))
}
