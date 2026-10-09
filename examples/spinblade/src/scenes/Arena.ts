import { Camera2D, Ease, HitTester, Particles2D, Scene, type TileMapLayer, type Tween, v, Vector2 } from 'sapling2d'
import { ASSETS } from '../assets'
import { BOSS, FEEL, KNIFE, PLAYER, TILE, Z } from '../config'
import { KnifeCollider } from '../KnifeCollider'
import { Boss } from '../nodes/Boss'
import { Enemy, type EnemyWorld } from '../nodes/Enemy'
import type { Fighter } from '../nodes/Fighter'
import { Hud } from '../nodes/Hud'
import { Knife } from '../nodes/Knife'
import { Player } from '../nodes/Player'
import { Result } from './Result'

export type ArenaState = 'fight' | 'boss' | 'cleared' | 'dead'

/**
 * 场地：从 Tiled 关卡创建地板和墙（图块层），按对象层放玩家、敌人、地上的刀和 Boss 的出生点。
 * 所有刀都直接挂在场地下面（同一个坐标系），刀圈里的刀由主人摆放。
 *
 * 每个物理步按顺序：
 * 1. 所有角色移动、转刀圈（`Fighter.step`）；
 * 2. KnifeCollider 判定这一步里的刀碰刀、刀砍身体（拆子步，不会漏）：碰到的刀被打飞（火花），砍到的扣血；
 *    玩家参与的碰撞有打击停顿和屏幕震动；
 * 3. 血量为 0 的角色死亡：刀圈散落一地、碎片飞溅；
 * 4. 角色之间互相推开、角色捡起碰到的刀（HitTester）。
 *
 * 流程：清掉所有普通敌人后 Boss 出现，打败 Boss 通关；玩家死亡则失败。两种结果都切换到 Result 画面。
 */
export class Arena extends Scene implements EnemyWorld {
  static override assets = ASSETS
  state: ArenaState = 'fight'
  player!: Player
  boss: Boss | null = null
  camera!: Camera2D
  hud!: Hud
  readonly enemies: Enemy[] = []
  /** 玩家和所有敌人（活着的）。 */
  readonly fighters: Fighter[] = []
  /** 地上的刀（被捡起后由 `HitTester.compact` 去掉）。 */
  readonly groundKnives: Knife[] = []
  /** 墙和石头所在的图层：打飞的刀不会落在里面。 */
  walls!: TileMapLayer
  /** 刀碰刀的火花和死亡时的碎片：各一个发射器，移到发生的位置再 `emit()`（粒子发出后留在原地）。 */
  sparks!: Particles2D
  debris!: Particles2D
  bossSpawn = Vector2.ZERO
  private readonly _hits = new HitTester()
  private readonly _collider = new KnifeCollider({ knifeLength: KNIFE.length, knifeWidth: KNIFE.width })
  /** 这一步碰在一起的刀（两两一对）、砍中身体的刀和被砍的角色（KnifeCollider 的回调里记下，判定完再处理）。 */
  private readonly _clashed: Knife[] = []
  private readonly _hitKnives: Knife[] = []
  private readonly _hitTargets: Fighter[] = []
  /** 游戏时间到这之后才能再次打击停顿。 */
  private _hitStopReadyAt = 0
  private _shake: Tween | null = null
  /** HUD 上次显示的值：变了才更新文字（不每帧拼字符串）。 */
  private _hudHp = -1
  private _hudKnives = -1
  private _hudEnemies = -1
  private _hudState: ArenaState | null = null

  override ready() {
    // 上一局可能在打击停顿中结束
    this.tree.timeScale = 1
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
        this.spawnEnemy(new Enemy(this, o.x, o.y), Number(o.properties.knives ?? 3))
      } else if (o.type === 'Knife') {
        this.dropKnife(o.x, o.y, this.tree.rng.randfRange(0, Math.PI * 2))
      } else if (o.type === 'Boss') {
        this.bossSpawn = v(o.x, o.y)
      }
    }

    const fx = { texture: ASSETS.spark, emitting: false, zIndex: Z.ringKnife + 1 }
    this.sparks = this.add(
      new Particles2D({ name: 'Sparks', ...fx, amount: 200, lifetime: 0.3, lifetimeRandomness: 0.4, speedMin: 200, speedMax: 520, damping: 6, scaleStart: 1.3, scaleEnd: 0.2, alphaEnd: 0, selfModulate: 0xffe070 }),
    )
    this.debris = this.add(
      new Particles2D({ name: 'Debris', ...fx, amount: 300, lifetime: 0.7, lifetimeRandomness: 0.5, speedMin: 120, speedMax: 420, damping: 3, scaleStart: 2, scaleEnd: 0.3, alphaEnd: 0, selfModulate: 0xff7050 }),
    )

    // 相机跟着玩家（在 process 里移动，玩家死了也还在）；不超出场地
    this.camera = this.add(new Camera2D({ limitLeft: 0, limitTop: 0, limitRight: level.pixelWidth, limitBottom: level.pixelHeight }))
    this.camera.position = this.player.position
    this.hud = this.add(new Hud())
    this._updateHud()
  }

  override exitTree() {
    this.tree.timeScale = 1
  }

  /** 让一个敌人进场，给它 n 把刀。 */
  spawnEnemy<T extends Enemy>(enemy: T, knives: number): T {
    this.add(enemy)
    this.enemies.push(enemy)
    this.fighters.push(enemy)
    this.giveKnives(enemy, knives)
    return enemy
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

  override process() {
    if (!this.player.dead) this.camera.position = this.player.position
    this._updateHud()
  }

  override physicsProcess(dt: number) {
    const fighters = this.fighters
    for (let i = 0; i < fighters.length; i++) fighters[i]!.step(dt)

    this._collider.detect(fighters, this._onClash, this._onHit)
    this._applyHits()
    this._applyClashes()
    for (let i = fighters.length - 1; i >= 0; i--) if (fighters[i]!.dead) this.kill(fighters[i]!)

    this._hits.forEachHit(fighters, fighters, this._push)
    this._hits.forEachHit(fighters, this.groundKnives, this._pick)
    HitTester.compact(this.groundKnives)
  }

  /** 砍中身体：扣血（同一把刀有冷却）；砍到玩家时屏幕震一下。 */
  private _applyHits() {
    const time = this.tree.time
    for (let i = 0; i < this._hitKnives.length; i++) {
      const knife = this._hitKnives[i]!
      if (time < knife.hitReadyAt) continue
      knife.hitReadyAt = time + KNIFE.hitCooldown
      const target = this._hitTargets[i]!
      target.damage(1)
      if (target === this.player) this.shake(FEEL.shake * 0.7, FEEL.shakeTime)
    }
    this._hitKnives.length = 0
    this._hitTargets.length = 0
  }

  /** 刀碰刀：两把刀都被打飞，中间迸出火花；玩家参与时打击停顿 + 屏幕震动。 */
  private _applyClashes() {
    const clashed = this._clashed
    for (let i = 0; i < clashed.length; i += 2) {
      const a = clashed[i]!
      const b = clashed[i + 1]!
      const withPlayer = a.owner === this.player || b.owner === this.player
      this.sparks.position = v((a.x + b.x) / 2, (a.y + b.y) / 2)
      this.sparks.emit(FEEL.sparks)
      this.knockOff(a)
      this.knockOff(b)
      if (withPlayer) {
        this.hitStop(FEEL.hitStop)
        this.shake(FEEL.shake, FEEL.shakeTime)
      }
    }
    clashed.length = 0
  }

  /**
   * 角色死亡：刀圈里的刀全部散落、碎片飞溅、角色消失。
   * 玩家死亡 → 失败；最后一个普通敌人死亡 → Boss 出现；Boss 死亡 → 通关。
   */
  kill(fighter: Fighter): void {
    const knives = fighter.knives
    for (let i = knives.length - 1; i >= 0; i--) this.knockOff(knives[i]!)
    this.debris.position = fighter.position
    this.debris.emit(FEEL.debris)
    this.hitStop(FEEL.hitStop * 2)
    this.shake(FEEL.shake * 1.5, FEEL.shakeTime * 1.5)
    const i = this.fighters.indexOf(fighter)
    if (i >= 0) this.fighters.splice(i, 1)
    fighter.queueFree()

    if (fighter === this.player) {
      this.state = 'dead'
      this.tree.createTimer(PLAYER.deathDelay).timeout.connect(() => void this.tree.changeScene(Result, { cleared: false }), this)
      return
    }
    const e = this.enemies.indexOf(fighter as Enemy)
    if (e >= 0) this.enemies.splice(e, 1)
    if (fighter === this.boss) {
      this.boss = null
      if (this.state === 'boss') this._clear()
    } else if (this.enemies.length === 0 && this.state === 'fight') {
      this.spawnBoss()
    }
  }

  /** Boss 进场：从小变大，提示“Boss 出现！”。 */
  spawnBoss(): Boss {
    this.state = 'boss'
    const boss = this.spawnEnemy(new Boss(this, this.bossSpawn.x, this.bossSpawn.y), BOSS.knives)
    this.boss = boss
    boss.sprite.scale = v(0.2, 0.2)
    boss.sprite.createTween().to(boss.sprite, { scale: v(1, 1) }, 0.5, Ease.BackOut)
    this.hud.flash('Boss 出现！', 1.2)
    return boss
  }

  private _clear() {
    this.state = 'cleared'
    this.hud.flash('通关！', 1.5)
    this.tree.createTimer(PLAYER.deathDelay).timeout.connect(() => void this.tree.changeScene(Result, { cleared: true }), this)
  }

  /**
   * 打击停顿：游戏时间停一小会儿（真实时间），然后恢复。两次之间至少隔 `FEEL.hitStopCooldown` 秒游戏时间，
   * 连续的碰撞不会让画面一卡一卡的。用 connect 而不是 await 恢复：不依赖微任务，无头测试连续 step 也能恢复。
   */
  hitStop(seconds: number): void {
    const tree = this.tree
    if (tree.timeScale === 0 || tree.time < this._hitStopReadyAt) return
    this._hitStopReadyAt = tree.time + FEEL.hitStopCooldown
    tree.timeScale = 0
    tree.createTimer(seconds, { ignoreTimeScale: true }).timeout.connect(() => (tree.timeScale = 1), this)
  }

  /** 屏幕震动：相机的 offset 随机抖几下，越来越小，最后回到 0。 */
  shake(strength: number, duration: number): void {
    const camera = this.camera
    const rng = this.tree.rng
    this._shake?.kill()
    const steps = 4
    const t = camera.createTween()
    for (let i = 0; i < steps; i++) {
      const s = strength * (1 - i / steps)
      t.to(camera, { offset: v(rng.randfRange(-s, s), rng.randfRange(-s, s)) }, duration / (steps + 1))
    }
    t.to(camera, { offset: Vector2.ZERO }, duration / (steps + 1))
    this._shake = t
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

  private _updateHud() {
    const p = this.player
    const hp = p.dead ? 0 : p.hp
    const knives = p.dead ? 0 : p.knives.length
    const enemies = this.enemies.length
    if (hp === this._hudHp && knives === this._hudKnives && enemies === this._hudEnemies && this.state === this._hudState) return
    this._hudHp = hp
    this._hudKnives = knives
    this._hudEnemies = enemies
    this._hudState = this.state
    this.hud.update(hp, p.maxHp, knives, this.enemies.length, this.state === 'boss')
  }

  // 回调建一次（字段），物理步里不分配闭包

  private readonly _onClash = (a: Fighter, i: number, b: Fighter, j: number): void => {
    this._clashed.push(a.knives[i]!, b.knives[j]!)
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
