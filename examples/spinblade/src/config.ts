/** 所有可调的数值（像素、秒、弧度）。 */

export const TILE = 48

export const FIGHTER = {
  /** 身体（圆）的半径：推挤和捡刀用，和贴图（72×72）一样大。 */
  radius: 36,
  /** 和墙、石头碰撞的方框边长：比身体略小，贴着石头走更顺。 */
  box: 56,
  /** 推挤的强度：每个物理步消除剩下重叠的比例（0–1）。 */
  pushStiffness: 0.5,
  /** 受伤时变红的时间。 */
  flashTime: 0.15,
  /** 头顶血条（敌人和 Boss）：宽、高、离身体上边缘多远。 */
  barWidth: 70,
  barHeight: 8,
  barGap: 14,
}

export const PLAYER = {
  speed: 360,
  startKnives: 4,
  hp: 10,
  /** 死亡后多久显示结果。 */
  deathDelay: 1.5,
}

export const ENEMY = {
  speed: 220,
  hp: 4,
  /** 多远能看到玩家（中心距离）。 */
  sight: 650,
  /** 多远能看到地上的刀。 */
  knifeSight: 420,
  /** 刀比玩家少这么多把以上时逃跑。 */
  fleeMargin: 2,
  /** 隔多久重新决定一次做什么（秒）。 */
  thinkInterval: 0.3,
  /** 游走时换方向的间隔（秒，随机）。 */
  wanderMin: 1.2,
  wanderMax: 2.6,
}

export const BOSS = {
  /** 身体半径（贴图 120×120）。 */
  radius: 60,
  box: 96,
  hp: 30,
  knives: 16,
  speed: 160,
  /** 刀圈转速在 spin × (1 ± spinSwing) 之间起伏，周期 spinPeriod 秒。 */
  spin: 3,
  spinSwing: 0.6,
  spinPeriod: 4,
  /** 冲撞：每隔 dashEvery 秒，先预警 warnTime 秒，再以 dashSpeed 冲 dashTime 秒。 */
  dashEvery: 4,
  warnTime: 0.8,
  dashSpeed: 900,
  dashTime: 0.45,
  /** 预警区的宽度。 */
  warnWidth: 140,
}

/** 打击感：只在玩家参与时触发（别处的战斗不打断玩家）。 */
export const FEEL = {
  /** 打击停顿（真实时间秒）和两次停顿的最小间隔。 */
  hitStop: 0.06,
  hitStopCooldown: 0.25,
  /** 屏幕震动：强度（像素）和时间。 */
  shake: 10,
  shakeTime: 0.2,
  /** 刀碰刀的火花数；死亡时的碎片数。 */
  sparks: 8,
  debris: 40,
}

export const RING = {
  /** 转速（弧度/秒）；敌人反向转。 */
  spin: 3.5,
  /** 刀少时刀圈的半径（刀的中心到角色中心）。 */
  minRadius: 78,
  /** 相邻两把刀在刀圈上的间距（弧长）：刀多了刀圈就变大。 */
  spacing: 26,
}

export const KNIFE = {
  /** 地上的刀被捡起的距离：角色身体碰到这个圆就算捡到。 */
  pickRadius: 18,
  /** 碰撞盒（贴图 14×64，碰撞盒略小）：沿刀身的长度、宽度。 */
  length: 60,
  width: 12,
  /** 同一把刀砍中身体后，多久才能再次造成伤害。 */
  hitCooldown: 0.5,
  /** 刀碰刀后被打飞：飞出的距离和时间。 */
  flyDistance: 150,
  flyTime: 0.35,
}

/** 绘制顺序：地上的刀在角色下面，刀圈在角色上面。 */
export const Z = { groundKnife: 1, fighter: 2, ringKnife: 3 }
