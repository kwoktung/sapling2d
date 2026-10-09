/** 所有可调的数值（像素、秒）。 */

export const TILE = 16
/** 图块集里的图块编号（见 scripts/gen-assets.mjs 的 TILE_ORDER）。 */
export const TILE_USED = 4

export const PLAYER = {
  /** 碰撞盒（比 16×16 的图略窄，跳上窄缝和平台边缘更顺手）。 */
  width: 12,
  height: 16,
  maxSpeed: 110,
  accel: 520,
  /** 松开方向键时的减速度。 */
  friction: 700,
  gravity: 1250,
  /** 上升中按住跳跃键时的重力：按得越久跳得越高。 */
  gravityHold: 560,
  jumpSpeed: 330,
  maxFallSpeed: 420,
  /** 踩到敌人后弹起的速度。 */
  bounceSpeed: 220,
}

export const GOOMBA = {
  width: 14,
  height: 16,
  speed: 30,
  gravity: 1250,
  /** 进入屏幕右边这么远之内才开始走（和 FC 一样，敌人不会提前走散）。 */
  wakeDistance: 32,
  /** 被踩扁后留在屏幕上的时间。 */
  flatTime: 0.5,
}

export const SCORE = { stomp: 100, coin: 200, brick: 50, timeBonus: 50 }

/** 时间一格对应的游戏时间（秒），和 FC 一样比真实秒快。 */
export const TIME_TICK = 0.4
export const START_LIVES = 3
/** 死亡后多久重开。 */
export const RESTART_DELAY = 2.5
