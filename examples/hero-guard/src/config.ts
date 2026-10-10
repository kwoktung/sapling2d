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
  /** 路线预览：点的间距、显示多久（之后淡出）。 */
  previewSpacing: 26,
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
  slot: -200,
  preview: -100,
  projectile: 2000,
  fx: 2100,
  floatText: 2200,
  /** 拖动中的英雄画在最上面。 */
  dragging: 2300,
}
