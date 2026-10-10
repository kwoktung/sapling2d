/** 场地、界面、手感相关的数值（像素、秒）。设计分辨率 750×1334（竖屏、expand）。英雄、怪物、波次的数值在 data/ 下。 */

export const FIELD = {
  /** 怪物路线的横向范围。 */
  left: 60,
  right: 690,
  /** 出生的高度（屏幕上方之外）和底线：越过底线扣命。 */
  spawnY: -40,
  baseY: 1130,
}

/** 6 个槽位：两行三列，在场地中下部。 */
export const SLOTS = {
  columns: [165, 375, 585],
  rows: [740, 950],
  radius: 52,
}

export const PATH = {
  /** 控制点的纵向间隔（随机 ± jitter）。 */
  stepY: 190,
  jitterY: 40,
  /** 相邻两个控制点横向最多差多少：越大越弯。 */
  maxDx: 260,
  /**
   * 路线预览：点的间距、显示多久（之后淡出）。普通怪只显示前 `previewLength` 像素，
   * 而且离上一条普通预览不到 `previewGap` 秒就不显示（怪多的时候满屏都是点）。精英和 Boss 总是显示整条。
   */
  previewSpacing: 26,
  previewLength: 520,
  previewGap: 1.5,
  previewTime: 0.8,
  previewFade: 0.4,
}

export const START = { lives: 20 }

export const ENEMY_FEEL = {
  flashTime: 0.1,
  /** 走路的弹跳：每秒几下、多高（像素）、压扁多少。 */
  hopRate: 2.4,
  hopHeight: 6,
  squash: 0.12,
  barWidth: 46,
  barHeight: 6,
}

export const FEEL = {
  sparks: 6,
  debris: 14,
  shake: 14,
  shakeTime: 0.25,
  floatRise: 46,
  floatTime: 0.6,
  /** 两波之间的停顿。 */
  waveGap: 2,
}

/** 绘制层级：怪物和英雄按 y 排序（zIndex = y，0–1334），其他东西放在这个范围之外。 */
export const Z = {
  background: -1000,
  slot: -200,
  preview: -100,
  projectile: 2000,
  fx: 2100,
  floatText: 2200,
  /** 拖动中的英雄画在最上面。 */
  dragging: 2300,
}

/** 大招（spec 的起始值）。 */
export const ULT = {
  energyMax: 100,
  /** 英雄每造成这么多伤害 +1 能量。 */
  damagePerEnergy: 5,
  /** 同一个英雄两次大招之间至少隔多久（后期伤害高时不至于连放）。 */
  minInterval: 12,
  /** 弓手箭雨：半径、持续时间、几轮、每轮伤害 = 弓手伤害 × mul。 */
  rain: { radius: 120, time: 2, volleys: 10, mul: 2.5 },
  /** 法师陨石：半径、落地前的延迟、伤害 = 法师伤害 × mul。 */
  meteor: { radius: 160, delay: 0.8, mul: 16, hitStop: 0.08 },
  /** 骑士冲锋：沿线的宽度、伤害 = 骑士伤害 × mul、击退、眩晕、冲到顶再回来的总时间。 */
  charge: { width: 80, mul: 4, knockback: 60, stun: 1.5, time: 0.7, topY: 120 },
}
