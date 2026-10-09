import { Camera2D, CanvasLayer, Ease, HitTester, Scene, type TileMapLayer, TouchJoystick, v } from 'sapling2d'
import { ASSETS } from '../assets'
import { KNIFE, PLAYER, TILE, Z } from '../config'
import { KnifeCollider } from '../KnifeCollider'
import { Enemy } from '../nodes/Enemy'
import type { Fighter } from '../nodes/Fighter'
import { Knife } from '../nodes/Knife'
import { Player } from '../nodes/Player'

/**
 * 场地：从 Tiled 关卡创建地板和墙（图块层），按对象层放玩家、敌人和地上的刀。
 * 所有刀都直接挂在场地下面（同一个坐标系），刀圈里的刀由主人摆放。
 *
 * 每个物理步按顺序：
 * 1. 所有角色移动、转刀圈（`Fighter.step`）；
 * 2. KnifeCollider 判定这一步里的刀碰刀、刀砍身体（拆子步，不会漏）；碰到的刀被打飞，砍到的扣血；
 * 3. 角色之间互相推开、角色捡起碰到的刀（HitTester）。
 */
export class Arena extends Scene {
  static override assets = ASSETS
  player!: Player
  camera!: Camera2D
  joystick!: TouchJoystick
  readonly enemies: Enemy[] = []
  /** 玩家和所有敌人。 */
  readonly fighters: Fighter[] = []
  /** 地上的刀（被捡起后由 `HitTester.compact` 去掉）。 */
  readonly groundKnives: Knife[] = []
  /** 墙和石头所在的图层：打飞的刀不会落在里面。 */
  walls!: TileMapLayer
  private readonly _hits = new HitTester()
  private readonly _collider = new KnifeCollider({ knifeLength: KNIFE.length, knifeWidth: KNIFE.width })
  /** 这一步要打飞的刀、砍中身体的刀和被砍的角色（KnifeCollider 的回调里记下，判定完再处理）。 */
  private readonly _knocked: Knife[] = []
  private readonly _hitKnives: Knife[] = []
  private readonly _hitTargets: Fighter[] = []

  override ready() {
    const level = ASSETS.level
    for (const layer of level.createLayers()) {
      this.add(layer)
      if (layer.name === 'Walls') this.walls = layer
    }

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

    // 摇杆：在屏幕左半边按下的地方出现（浏览器里也可以用 WASD）
    const hud = this.add(new CanvasLayer({ name: 'Hud' }))
    this.joystick = hud.add(
      new TouchJoystick({ actions: { left: 'left', right: 'right', up: 'up', down: 'down' }, radius: 90, texture: ASSETS.stickBase, textureKnob: ASSETS.stickKnob }),
    )
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

  override physicsProcess(dt: number) {
    const fighters = this.fighters
    for (let i = 0; i < fighters.length; i++) fighters[i]!.step(dt)

    this._collider.detect(fighters, this._onClash, this._onHit)
    const time = this.tree.time
    for (let i = 0; i < this._hitKnives.length; i++) {
      const knife = this._hitKnives[i]!
      if (time < knife.hitReadyAt) continue
      knife.hitReadyAt = time + KNIFE.hitCooldown
      this._hitTargets[i]!.damage(1)
    }
    for (let i = 0; i < this._knocked.length; i++) this.knockOff(this._knocked[i]!)
    this._knocked.length = 0
    this._hitKnives.length = 0
    this._hitTargets.length = 0

    this._hits.forEachHit(fighters, fighters, this._push)
    this._hits.forEachHit(fighters, this.groundKnives, this._pick)
    HitTester.compact(this.groundKnives)
  }

  /**
   * 把刀从主人的刀圈里打飞：沿刀尖方向飞出去、边飞边转，落地后可以被任何人捡起。
   * 不会落进墙里：从主人的中心（一定在空地上）沿这个方向往外走，落在碰到墙之前的最后一个空地上
   * （刀圈里的刀可能本来就压在墙上）。
   */
  knockOff(knife: Knife): void {
    const owner = knife.owner
    if (!owner) return
    const ox = owner.x
    const oy = owner.y
    let dx = knife.x - ox
    let dy = knife.y - oy
    const d = Math.sqrt(dx * dx + dy * dy) || 1
    dx /= d
    dy /= d
    owner.removeKnife(knife)
    knife.flying = true
    knife.zIndex = Z.groundKnife
    const sample = TILE / 4
    const end = d + KNIFE.flyDistance
    let reach = 0
    for (let t = sample; t <= end; t += sample) {
      if (this.isSolid(ox + dx * t, oy + dy * t)) break
      reach = t
    }
    const spin = (this.tree.rng.randf() < 0.5 ? -1 : 1) * this.tree.rng.randfRange(2, 4) * Math.PI
    knife
      .createTween()
      .to(knife, { position: v(ox + dx * reach, oy + dy * reach), rotation: knife.rotation + spin }, KNIFE.flyTime, Ease.QuadOut)
      .call(() => {
        knife.flying = false
        this.groundKnives.push(knife)
      })
  }

  /** 场地坐标 (x, y) 是不是墙或石头（场地外也算）。 */
  isSolid(x: number, y: number): boolean {
    const cx = Math.floor(x / TILE)
    const cy = Math.floor(y / TILE)
    if (cx < 0 || cy < 0 || cx >= this.walls.width || cy >= this.walls.height) return true
    return this.walls.getCell(cx, cy) !== 0
  }

  // 回调建一次（字段），物理步里不分配闭包

  private readonly _onClash = (a: Fighter, i: number, b: Fighter, j: number): void => {
    this._knocked.push(a.knives[i]!, b.knives[j]!)
  }

  private readonly _onHit = (a: Fighter, i: number, b: Fighter): void => {
    this._hitKnives.push(a.knives[i]!)
    this._hitTargets.push(b)
  }

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
