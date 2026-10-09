import { Camera2D, HitTester, Scene, v } from 'sapling2d'
import { ASSETS } from '../assets'
import { PLAYER, Z } from '../config'
import { Enemy } from '../nodes/Enemy'
import type { Fighter } from '../nodes/Fighter'
import { Knife } from '../nodes/Knife'
import { Player } from '../nodes/Player'

/**
 * 场地：从 Tiled 关卡创建地板和墙（图块层），按对象层放玩家、敌人和地上的刀。
 * 所有刀都直接挂在场地下面（同一个坐标系），刀圈里的刀由主人摆放。
 * 每个物理步：角色之间互相推开、角色捡起碰到的刀（都用 HitTester）。
 */
export class Arena extends Scene {
  static override assets = ASSETS
  player!: Player
  camera!: Camera2D
  readonly enemies: Enemy[] = []
  /** 玩家和所有敌人。 */
  readonly fighters: Fighter[] = []
  /** 地上的刀（被捡起后由 `HitTester.compact` 去掉）。 */
  readonly groundKnives: Knife[] = []
  private readonly _hits = new HitTester()

  override ready() {
    const level = ASSETS.level
    for (const layer of level.createLayers()) this.add(layer)

    for (const o of level.objects('Entities')) {
      if (o.type === 'Spawn') {
        this.player = this.add(new Player(o.x, o.y))
        this.fighters.push(this.player)
        this.giveKnives(this.player, PLAYER.startKnives)
      } else if (o.type === 'Enemy') {
        const enemy = this.add(new Enemy(o.x, o.y))
        this.enemies.push(enemy)
        this.fighters.push(enemy)
        this.giveKnives(enemy, Number(o.properties.knives ?? 3))
      } else if (o.type === 'Knife') {
        this.dropKnife(o.x, o.y, this.tree.rng.randfRange(0, Math.PI * 2))
      }
    }

    // 相机挂在玩家下面，跟着玩家走；不超出场地
    this.camera = this.player.add(new Camera2D({ limitLeft: 0, limitTop: 0, limitRight: level.pixelWidth, limitBottom: level.pixelHeight }))
  }

  /** 在地上放一把刀。 */
  dropKnife(x: number, y: number, rotation: number): Knife {
    const knife = this.add(new Knife({ position: v(x, y), rotation, zIndex: Z.groundKnife }))
    this.groundKnives.push(knife)
    return knife
  }

  /** 给角色 n 把新刀。 */
  giveKnives(fighter: Fighter, n: number): void {
    for (let i = 0; i < n; i++) fighter.addKnife(this.add(new Knife()))
  }

  override physicsProcess() {
    this._hits.forEachHit(this.fighters, this.fighters, this._push)
    this._hits.forEachHit(this.fighters, this.groundKnives, this._pick)
    HitTester.compact(this.groundKnives)
  }

  // HitTester 的回调建一次（字段），物理步里不分配闭包

  /** 重叠的两个角色各自记下要被推开的一半距离（每一对会以 (a, b)、(b, a) 各报告一次）。 */
  private readonly _push = (a: Fighter, b: Fighter): boolean => {
    let dx = a.x - b.x
    let dy = a.y - b.y
    let d = Math.sqrt(dx * dx + dy * dy)
    if (d < 1e-6) {
      // 完全重合：按在数组里的先后往左右分开
      dx = this.fighters.indexOf(a) < this.fighters.indexOf(b) ? -1 : 1
      dy = 0
      d = 1
    }
    const overlap = a.hitShape.radius + b.hitShape.radius - d
    a.pushX += (dx / d) * overlap * 0.5
    a.pushY += (dy / d) * overlap * 0.5
    return false
  }

  /** 捡刀：被捡起的刀 dead 变成 true，后面的角色不会再捡到它。 */
  private readonly _pick = (fighter: Fighter, knife: Knife): boolean => {
    fighter.addKnife(knife)
    return false
  }
}
