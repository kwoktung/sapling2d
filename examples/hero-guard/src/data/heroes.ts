/** 英雄的基础数值（spec 的起始值）。纯数据，不依赖引擎。 */

export type HeroKind = 'archer' | 'mage' | 'knight'

export const HERO_KINDS: readonly HeroKind[] = ['archer', 'mage', 'knight']

export interface HeroBase {
  name: string
  /** 一句话的定位（选英雄画面用）。 */
  role: string
  damage: number
  /** 两次攻击之间的秒数。 */
  interval: number
  range: number
}

export const HEROES: Record<HeroKind, HeroBase> = {
  archer: { name: '弓手', role: '远程单体，射程最远', damage: 12, interval: 0.7, range: 340 },
  mage: { name: '法师', role: '范围伤害，清成群的小怪', damage: 18, interval: 1.6, range: 280 },
  knight: { name: '骑士', role: '近战控制，击退和眩晕', damage: 22, interval: 1.1, range: 150 },
}

/** 武器挂在身体上的位置（相对身体节点的原点：脚底中心）和攻击动作的节奏。占位图的值，正式美术在 03 调。 */
export const RIG: Record<HeroKind, { weaponX: number; weaponY: number; windup: number; recover: number }> = {
  archer: { weaponX: 26, weaponY: -44, windup: 0.16, recover: 0.18 },
  mage: { weaponX: 30, weaponY: -50, windup: 0.22, recover: 0.2 },
  knight: { weaponX: 28, weaponY: -46, windup: 0.14, recover: 0.2 },
}
