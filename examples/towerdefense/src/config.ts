/** 所有可调的数值（像素、秒）。设计分辨率 750×1334。 */

export const FIELD = {
  /** 怪物路径的横向范围。 */
  left: 60,
  right: 690,
  /** 出生的高度（屏幕上方之外）和底线：走到底线扣一条命。 */
  spawnY: -40,
  baseY: 1120,
}

/** 英雄槽位：3 行 × 4 列。 */
export const SLOTS = {
  columns: [150, 300, 450, 600],
  rows: [430, 670, 910],
  radius: 46,
}

export const PATH = {
  /** 控制点的纵向间隔（随机 ± jitter）。 */
  stepY: 190,
  jitterY: 40,
  /** 相邻两个控制点横向最多差多少：越大越弯。 */
  maxDx: 260,
}

export const START = { gold: 150, lives: 10 }

export const WAVE = {
  count: (round: number) => 8 + round * 3,
  hp: (round: number) => Math.round(30 * 1.25 ** (round - 1)),
  speed: (round: number) => 70 + round * 4,
  interval: (round: number) => Math.max(0.3, 0.85 - round * 0.04),
  reward: (round: number) => 4 + round,
  /** 一波开始前的停顿。 */
  delay: 1.2,
}

export const ENEMY = {
  radius: 26,
  /** 受击闪白的时间。 */
  flashTime: 0.08,
  /** 被击中时沿路径往回推的距离。 */
  knockback: 6,
  barWidth: 44,
  barHeight: 6,
}

export const FEEL = {
  sparks: 6,
  debris: 14,
  shake: 14,
  shakeTime: 0.25,
  /** 飘字：上升高度和时间。 */
  floatRise: 46,
  floatTime: 0.6,
}

/** 绘制层级：怪物和英雄按 y 排序（zIndex = y，0–1334），其他东西放在这个范围之外。 */
export const Z = {
  slot: -100,
  range: -50,
  projectile: 2000,
  fx: 2100,
  floatText: 2200,
}
