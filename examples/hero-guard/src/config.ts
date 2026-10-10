/** 场地、界面、手感相关的数值（像素、秒）。设计分辨率 750×1334（竖屏、expand）。英雄、怪物、波次的数值在 data/ 下。 */

export const FIELD = {
  /** 怪物路线的横向范围。 */
  left: 80,
  right: 670,
  /** 出生的高度（屏幕上方之外）和底线：越过底线扣命。 */
  spawnY: -40,
  baseY: 1130,
}

/**
 * 英雄的活动区域（矩形，英雄的脚底不出这个范围）。从底线往上算场地高度（`baseY − spawnY` = 1170）的比例：
 * 近战在中上（横向中间 70%，纵向 30%–60%）；远程在左下 / 右下（纵向 0–30%，各占半边），先上场的去左下。
 * 左右和底下各留一点边，英雄不贴着屏幕边、不站在城墙上。
 */
export const ZONES = {
  melee: { left: 112, top: 428, right: 638, bottom: 779 },
  rangedLeft: { left: 50, top: 779, right: 375, bottom: 1090 },
  rangedRight: { left: 375, top: 779, right: 700, bottom: 1090 },
}

/** 英雄的走位、血量恢复、阵亡（spec“站位和走位”）。 */
export const HERO_FEEL = {
  /** 移动速度（像素/秒）。 */
  meleeSpeed: 140,
  rangedSpeed: 90,
  /** 远程射程内没目标时往最近的怪挪；挪到目标进射程的这个比例就停（留点余量）。 */
  approach: 0.9,
  /** 脱战多久开始回血、每秒回最大血量的多少。 */
  regenDelay: 3,
  regenRate: 0.05,
  /** 阵亡后多久原地复活、复活后无敌多久。 */
  respawn: 15,
  invulnerable: 1,
  /** 受击闪白、头顶血条的大小（像素）。 */
  flashTime: 0.12,
  barWidth: 56,
  barHeight: 7,
}

/** 怪物的仇恨：多远看到英雄就过去打、英雄走出多远就放弃（回到路线）；近战够得着的距离 = 英雄半径 + 怪的半径。 */
export const AGGRO = {
  radius: 110,
  leash: 180,
  heroRadius: 34,
  /** 攻击时朝英雄扑一下：距离、时间。 */
  lunge: 12,
  lungeTime: 0.14,
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
  /** 墓碑画在地上（比英雄和怪低）。 */
  tomb: -200,
  preview: -100,
  projectile: 2000,
  fx: 2100,
  floatText: 2200,
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
  /**
   * 骑士战吼：半径内的地面怪受骑士伤害 × mul，被嘲讽 `taunt` 秒、被拉向骑士 `pull` 像素（Boss 只受伤害，飞行怪不受影响）；
   * 骑士 `time` 秒内受到的伤害减少 `reduction`，立刻回复最大血量的 `heal`。
   */
  warcry: { radius: 250, mul: 2, taunt: 5, pull: 60, time: 5, reduction: 0.6, heal: 0.3 },
}
