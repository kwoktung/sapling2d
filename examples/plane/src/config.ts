import { circle, rectangle, type CircleShape2D } from 'sapling2d'

/** 游戏数值。单位：像素、秒、像素/秒（设计分辨率 750×1334）。 */

export const PLAYER = {
  lives: 3,
  maxLives: 5,
  /** 碰撞形状：比贴图小很多，玩家才觉得“擦弹”是公平的。 */
  hitShape: circle(14),
  keyboardSpeed: 700,
  /** 出生点离可见区域底边的距离。 */
  bottomMargin: 200,
  /** 战机中心离可见区域边缘的最小距离。 */
  edgeMargin: 40,
  invincibleSeconds: 2,
}

export const WEAPON = {
  fireInterval: 0.12,
  bulletSpeed: 1400,
  bulletShape: circle(8),
  damage: 1,
  maxPower: 4,
  /** 每两轮射击才播一次音效：每秒 8 次太吵。 */
  soundEvery: 2,
}

export type EnemyKind = 'small' | 'medium' | 'large'

export interface EnemyConfig {
  frame: string
  hp: number
  /** 碰撞半径，也用于出怪边距、枪口位置、飞出屏幕的判断。 */
  radius: number
  /** 向下的速度。 */
  speed: number
  /** 左右摆动的幅度和频率（0 表示直线）。 */
  sway: number
  swayHz: number
  /** 大型飞机下到这个高度（离可见区域顶边）后停住，只左右摆动。 */
  hoverAt: number | null
  score: number
  /** 射击：瞄准玩家（aimed）或向下扇形（spread）；null 表示不射击。 */
  fire: { pattern: 'aimed' | 'spread'; interval: number; speed: number; firstDelay: number } | null
  /** 被击毁时掉落道具的概率。 */
  drop: { power: number; life: number }
  explosionScale: number
}

export const ENEMIES: Record<EnemyKind, EnemyConfig> = {
  small: { frame: 'enemy_small', hp: 1, radius: 28, speed: 260, sway: 0, swayHz: 0, hoverAt: null, score: 100, fire: null, drop: { power: 0.02, life: 0 }, explosionScale: 0.8 },
  medium: {
    frame: 'enemy_medium',
    hp: 5,
    radius: 40,
    speed: 150,
    sway: 90,
    swayHz: 0.4,
    hoverAt: null,
    score: 300,
    fire: { pattern: 'aimed', interval: 1.8, speed: 380, firstDelay: 0.9 },
    drop: { power: 0.12, life: 0.04 },
    explosionScale: 1.3,
  },
  large: {
    frame: 'enemy_large',
    hp: 30,
    radius: 70,
    speed: 70,
    sway: 160,
    swayHz: 0.15,
    hoverAt: 260,
    score: 1500,
    fire: { pattern: 'spread', interval: 1.4, speed: 300, firstDelay: 1.5 },
    drop: { power: 0.7, life: 0.3 },
    explosionScale: 2.4,
  },
}

/** 各种敌机的碰撞形状：由 radius 生成，所有同类敌机共用。 */
export const ENEMY_SHAPES = Object.fromEntries(Object.entries(ENEMIES).map(([kind, c]) => [kind, circle(c.radius)])) as Record<EnemyKind, CircleShape2D>

export const ENEMY_BULLET = { shape: circle(9) }

export type PowerUpKind = 'power' | 'life'

export const POWERUP = { hitShape: circle(30), speed: 180 }

/** 出怪：间隔随时间缩短；中型、大型飞机在开局一段时间后才出现，比例逐渐提高。 */
export const WAVES = {
  startInterval: 1.1,
  minInterval: 0.3,
  /** 每秒缩短多少。 */
  intervalDecay: 0.012,
  mediumFrom: 8,
  largeFrom: 25,
}

export const BACKGROUND_SPEED = 120

export const BOSS = {
  /** 第一个 Boss 的出现时间（战斗开始后，秒；警告从这时开始）。 */
  firstAt: 60,
  /** 击败 Boss 后，下一个 Boss 在恢复出怪后多久出现。 */
  interval: 75,
  /** 击败后多久恢复普通出怪。 */
  resumeDelay: 3,
  warningSeconds: 2.5,
  /** 从屏幕上方飞到位的时间；期间打不动。 */
  enterSeconds: 2.5,
  /** 到位后离可见区域顶边的高度。 */
  hoverY: 300,
  hp: 300,
  /** 每个 Boss 比上一个多多少血。 */
  hpGrowth: 1.5,
  /** 机身矩形（贴图 300×230，去掉翼尖和尾部）。 */
  hitShape: rectangle(240, 150),
  /** 贴图半宽：左右摆动时不超出屏幕。 */
  halfWidth: 150,
  score: 10000,
  sway: 220,
  swayHz: 0.12,
  bulletShape: circle(11),
  /** 血量比例低于这些值时进入第二、第三阶段。 */
  phase2Below: 0.6,
  phase3Below: 0.3,
}
