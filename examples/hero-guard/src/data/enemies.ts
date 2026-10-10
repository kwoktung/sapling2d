/** 怪物的基础数值（第 1 波的值）。纯数据。 */

export type EnemyKind = 'slime'

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
}

export const ENEMIES: Record<EnemyKind, EnemyBase> = {
  slime: { name: '史莱姆', hp: 40, speed: 60, xp: 1, leak: 1, scale: 1 },
}

/** 每波血量乘以这个数的 (波次 - 1) 次方。 */
export const HP_GROWTH = 1.12

export function enemyHp(kind: EnemyKind, wave: number): number {
  return Math.round(ENEMIES[kind].hp * HP_GROWTH ** (wave - 1))
}
