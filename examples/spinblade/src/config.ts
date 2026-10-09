/** 所有可调的数值（像素、秒、弧度）。 */

export const TILE = 48

export const FIGHTER = {
  /** 身体（圆）的半径：推挤和捡刀用，和贴图（72×72）一样大。 */
  radius: 36,
  /** 和墙、石头碰撞的方框边长：比身体略小，贴着石头走更顺。 */
  box: 56,
  /** 推挤的强度：每个物理步消除剩下重叠的比例（0–1）。 */
  pushStiffness: 0.5,
  hp: 10,
  /** 受伤时变红的时间。 */
  flashTime: 0.15,
}

export const PLAYER = {
  speed: 360,
  startKnives: 4,
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
