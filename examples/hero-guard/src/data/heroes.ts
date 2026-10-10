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

/**
 * 身体和武器怎么拼：武器的握持点放在身体空着的那只手上（相对英雄节点的原点：脚底中心，朝右时），攻击动作的节奏。
 * `bodyFlip`：身体图里空手在左边的，翻过来让空手朝右（英雄朝右时武器在右手）。武器画在身体后面，拳头盖住握柄，看起来是握着的。
 * 数值是在浏览器里把三个英雄放大并排、对着空拳调出来的。
 */
export const RIG: Record<HeroKind, { bodyFlip: boolean; weaponX: number; weaponY: number; windup: number; recover: number }> = {
  archer: { bodyFlip: true, weaponX: 37, weaponY: -50, windup: 0.16, recover: 0.18 },
  mage: { bodyFlip: false, weaponX: 36, weaponY: -65, windup: 0.22, recover: 0.2 },
  knight: { bodyFlip: true, weaponX: 33, weaponY: -50, windup: 0.14, recover: 0.2 },
}
