import { Camera2D, ColorRect, Ease, HitTester, Node2D, Particles2D, rect, Scene, Sprite2D, type Tween, v, Vector2 } from 'sapling2d'
import { ASSETS } from '../assets'
import { ENEMY, FEEL, FIELD, SLOTS, START, WAVE, Z } from '../config'
import { Enemy } from '../nodes/Enemy'
import { FloatText } from '../nodes/FloatText'
import { Hero, type HeroWorld } from '../nodes/Hero'
import { Hud } from '../nodes/Hud'
import { Projectile } from '../nodes/Projectile'
import { UpgradePicker } from '../nodes/UpgradePicker'
import { randomPath } from '../path'
import { baseStats, drawUpgrades, type HeroKind, type HeroStats, type Upgrade } from '../skills'

export type BattleState = 'wave' | 'picking' | 'lost'

/** 英雄槽位：点一下放下当前选中的英雄。 */
export class Slot extends Sprite2D {
  hero: Hero | null = null

  constructor(position: Vector2) {
    super({ texture: ASSETS.slot, position, zIndex: Z.slot, inputPickable: true, hitArea: rect(-SLOTS.radius, -SLOTS.radius, SLOTS.radius * 2, SLOTS.radius * 2) })
  }
}

/**
 * 战斗场景：怪物一波波沿随机曲线下来，英雄自动攻击，波次之间三选一升级；命用完失败，点屏幕重来。
 *
 * 场景的 process 先于子节点运行：这里先生成怪、处理上一帧走到底线的怪、清掉死怪，
 * 然后怪物前进、英雄攻击、箭和飘字各自在自己的 process 里更新。
 */
export class Battle extends Scene implements HeroWorld {
  static override assets = ASSETS
  state: BattleState = 'wave'
  stats: Record<HeroKind, HeroStats> = baseStats()
  gold = START.gold
  lives = START.lives
  round = 0
  readonly enemies: Enemy[] = []
  readonly heroes: Hero[] = []
  readonly slots: Slot[] = []
  readonly placed = new Set<HeroKind>()
  /** 选了的升级（测试和调试用）。 */
  readonly taken: string[] = []
  hud!: Hud
  camera!: Camera2D
  picker: UpgradePicker | null = null
  /** 所有发光特效的父节点（叠加混合，设一次）：火花、爆炸光圈、刀光。挨在一起绘制，合成一批。 */
  fx!: Node2D
  sparks!: Particles2D
  debris!: Particles2D
  /** 这一波还要生成几只、下一只还有多久。 */
  toSpawn = 0
  /** 见 stopSpawning()。 */
  manual = false
  /** 压力测试：怪走到底线后回到起点，数量不变、不扣命。 */
  stressMode = false
  /** 伤害飘字的文字（压力测试换成每次都不同的数字，测 Label 重新栅格化的代价）。 */
  formatDamage = (amount: number): string => String(Math.round(amount))
  private _spawnIn = 0
  /** 对象池：箭和火球、飘字（引擎缺口：对象池手写）。 */
  private readonly _projectiles: Projectile[] = []
  private readonly _floats: FloatText[] = []
  private _shake: Tween | null = null
  /** HUD 上次显示的值：变了才更新文字。 */
  private _hud = { gold: -1, lives: -1, round: -1 }

  override ready() {
    // 底线
    this.add(new ColorRect({ name: 'BaseLine', position: v(0, FIELD.baseY), size: v(750, 4), color: 0xc04030, zIndex: Z.slot }))
    for (const y of SLOTS.rows) {
      for (const x of SLOTS.columns) {
        const slot = this.add(new Slot(v(x, y)))
        slot.clicked.connect(() => this.placeHero(slot, this.hud.selected), this)
        this.slots.push(slot)
      }
    }
    // 碎片是怪物的碎块（普通混合），画在发光特效下面；火花在 fx 里叠加发光
    this.debris = this.add(
      new Particles2D({ name: 'Debris', texture: ASSETS.spark, emitting: false, zIndex: Z.fx - 1, amount: 400, lifetime: 0.6, lifetimeRandomness: 0.5, speedMin: 100, speedMax: 360, damping: 3, scaleStart: 1.8, scaleEnd: 0.3, alphaEnd: 0, selfModulate: 0xd0503c }),
    )
    this.fx = this.add(new Node2D({ name: 'Fx', zIndex: Z.fx, blendMode: 'add' }))
    this.sparks = this.fx.add(
      new Particles2D({ name: 'Sparks', texture: ASSETS.spark, emitting: false, amount: 300, lifetime: 0.25, lifetimeRandomness: 0.4, speedMin: 120, speedMax: 320, damping: 6, scaleStart: 1.2, scaleEnd: 0.2, alphaEnd: 0, selfModulate: 0xffe070 }),
    )
    this.camera = this.add(new Camera2D({ position: v(375, 667) }))
    this.hud = this.add(new Hud())
    this.startWave(1)
  }

  // ---------------------------------------------------------------- 波次

  startWave(round: number): void {
    this.round = round
    this.state = 'wave'
    this.toSpawn = WAVE.count(round)
    this._spawnIn = WAVE.delay
    this.hud.flash(`第 ${round} 波`, 1)
  }

  /** 生成一只怪：默认走一条新的随机路径。 */
  spawnEnemy(path = randomPath((a, b) => this.tree.rng.randfRange(a, b)), hp = WAVE.hp(Math.max(1, this.round)), speed = WAVE.speed(Math.max(1, this.round))): Enemy {
    const e = this.add(new Enemy(path, hp, speed, WAVE.reward(Math.max(1, this.round))))
    this.enemies.push(e)
    return e
  }

  /** 测试用：不再自动生成怪、也不自动结束一波（测试自己放怪，场上清空时不弹升级）。 */
  stopSpawning(): void {
    this.toSpawn = 0
    this.manual = true
  }

  override process(dt: number) {
    if (this.state === 'lost' && this.tree.input.isActionJustPressed('confirm')) {
      void this.tree.changeScene(Battle)
      return
    }
    if (this.state === 'wave' && this.toSpawn > 0) {
      this._spawnIn -= dt
      if (this._spawnIn <= 0) {
        this.toSpawn--
        this._spawnIn = WAVE.interval(this.round)
        this.spawnEnemy()
      }
    }
    // 上一帧走到底线的怪：扣命、移除
    const enemies = this.enemies
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!
      if (e.leaked && !e.dead && this.stressMode) {
        e.leaked = false
        e.dist = 0
      } else if (e.leaked && !e.dead) {
        e.dead = true
        e.queueFree()
        this.loseLife()
      }
    }
    HitTester.compact(enemies)
    if (this.state === 'wave' && !this.manual && this.toSpawn === 0 && enemies.length === 0) this.openPicker()
    this._updateHud()
  }

  loseLife(): void {
    if (this.state === 'lost') return
    this.lives--
    this.shake(FEEL.shake, FEEL.shakeTime)
    if (this.lives > 0) return
    this.state = 'lost'
    this.hud.flash('失败\n点屏幕重来', 0)
  }

  openPicker(): void {
    this.state = 'picking'
    const offers = drawUpgrades(this.placed, 3, (n) => this.tree.rng.randiRange(0, n - 1))
    this.picker = this.add(new UpgradePicker(offers))
    this.picker.picked.connect((u) => this.pick(u), this)
  }

  pick(upgrade: Upgrade): void {
    this.manual = false
    upgrade.apply(this.stats)
    this.taken.push(upgrade.id)
    this.picker = null
    this.startWave(this.round + 1)
  }

  // ---------------------------------------------------------------- 英雄

  /** 在槽位上放一个英雄：槽位空着、金币够才放；返回是否放下了。 */
  placeHero(slot: Slot, kind: HeroKind): boolean {
    if (this.state === 'lost' || slot.hero) return false
    const cost = this.stats[kind].cost
    if (this.gold < cost) {
      this.hud.flash('金币不够', 0.6)
      return false
    }
    this.gold -= cost
    slot.hero = this.add(new Hero(this, kind, slot.position))
    this.heroes.push(slot.hero)
    this.placed.add(kind)
    return true
  }

  /**
   * 射程内最靠近底线（剩余路程最短）的怪物。
   * 引擎缺口（验证清单“范围查询”）：线性遍历所有怪；12 个英雄 × 60 只怪每帧 720 次距离比较。
   */
  findTarget(x: number, y: number, range: number): Enemy | null {
    const r2 = range * range
    let best: Enemy | null = null
    let bestRemaining = Infinity
    const enemies = this.enemies
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!
      if (e.dead || e.leaked) continue
      const dx = e.x - x
      const dy = e.y - y
      if (dx * dx + dy * dy > r2) continue
      const rem = e.remaining
      if (rem < bestRemaining) {
        bestRemaining = rem
        best = e
      }
    }
    return best
  }

  /** 出手帧：弓手射箭（多重箭打不同的目标）、法师扔火球、剑士扇形斩击。 */
  strike(hero: Hero, target: Enemy): void {
    const s = hero.stats
    const mx = hero.x
    const my = hero.y - 60 // 武器的位置（灰盒：固定偏移，真美术用 Aseprite slice）
    if (hero.kind === 'archer') {
      this._launch('arrow', mx, my, target, s.damage)
      for (let n = 1; n < s.arrows; n++) {
        const other = this._nthTarget(hero, n)
        if (other) this._launch('arrow', mx, my, other, s.damage)
      }
    } else if (hero.kind === 'mage') {
      this._launch('fireball', mx, my, target, s.damage)
    } else {
      this._slash(hero, target, s)
    }
  }

  /** 射程内第 n 靠近底线的怪（多重箭）；没有那么多时返回 null。 */
  private _nthTarget(hero: Hero, n: number): Enemy | null {
    const r2 = hero.stats.range ** 2
    const inRange = this.enemies.filter((e) => !e.dead && (e.x - hero.x) ** 2 + (e.y - hero.y) ** 2 <= r2)
    inRange.sort((a, b) => a.remaining - b.remaining)
    return inRange[n] ?? null
  }

  private _launch(kind: 'arrow' | 'fireball', x: number, y: number, target: Enemy, damage: number) {
    let p = this._projectiles.find((q) => !q.active)
    if (!p) {
      p = this.add(new Projectile())
      p.onArrive = this._onArrive
      this._projectiles.push(p)
    }
    p.launch(kind, x, y, target, damage)
  }

  private readonly _onArrive = (p: Projectile) => {
    if (p.kind === 'arrow') {
      const t = p.target
      if (t && !t.dead && !t.leaked) this.damage(t, p.damage)
      return
    }
    // 火球落地：范围伤害（引擎缺口：范围查询，线性遍历）
    const blast = this.stats.mage.blast
    const r2 = blast * blast
    const enemies = this.enemies
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!
      if (!e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= r2) this.damage(e, p.damage)
    }
    this.burst(p.x, p.y, blast)
  }

  /** 剑士：朝目标方向的扇形，打中半径内、角度内的所有怪。 */
  private _slash(hero: Hero, target: Enemy, s: HeroStats) {
    const angle = Math.atan2(target.x - hero.x, -(target.y - hero.y)) // 0 = 正上方，和刀光贴图一致
    const reach = s.range + ENEMY.radius
    const half = s.arc / 2
    const enemies = this.enemies
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!
      if (e.dead) continue
      const dx = e.x - hero.x
      const dy = e.y - hero.y
      if (dx * dx + dy * dy > reach * reach) continue
      let da = Math.atan2(dx, -dy) - angle
      da = Math.atan2(Math.sin(da), Math.cos(da))
      if (Math.abs(da) <= half || e === target) this.damage(e, s.damage)
    }
    // 刀光（在 fx 里，叠加发光）：贴图是 120° 的弧，按扇形角度缩放宽度不准确，灰盒里只按距离缩放
    const scale = (s.range * 2) / 200
    const fx = this.fx.add(new Sprite2D({ texture: ASSETS.slash, position: hero.position, rotation: angle, scale: v(scale * 0.8, scale * 0.8), selfModulate: 0xa8c8ff }))
    fx.createTween().to(fx, { scale: v(scale, scale), alpha: 0 }, 0.18, Ease.QuadOut).call(() => fx.queueFree())
  }

  /** 爆炸特效：一个放大淡出的光圈 + 火花（都在 fx 里，叠加发光）。 */
  burst(x: number, y: number, radius: number) {
    const s = (radius * 2) / 64
    const fx = this.fx.add(new Sprite2D({ texture: ASSETS.glow, position: v(x, y), scale: v(s * 0.4, s * 0.4), selfModulate: 0xff8030 }))
    fx.createTween().to(fx, { scale: v(s, s), alpha: 0 }, 0.3, Ease.QuadOut).call(() => fx.queueFree())
    this.sparks.position = v(x, y)
    this.sparks.emit(FEEL.sparks * 2)
  }

  /** 扣血、飘字、火花；打死了给金币、碎片。 */
  damage(e: Enemy, amount: number): void {
    const killed = e.damage(amount)
    this._float(this.formatDamage(amount), e.x, e.y - 30, killed ? 0xffd040 : 0xffffff)
    if (!killed) {
      this.sparks.position = e.position
      this.sparks.emit(FEEL.sparks)
      return
    }
    this.gold += e.reward
    this.debris.position = e.position
    this.debris.emit(FEEL.debris)
    e.queueFree()
  }

  private _float(text: string, x: number, y: number, color: number) {
    let f: FloatText | undefined
    for (let i = 0; i < this._floats.length; i++) {
      if (!this._floats[i]!.active) {
        f = this._floats[i]!
        break
      }
    }
    if (!f) {
      f = this.add(new FloatText())
      f.zIndex = Z.floatText
      this._floats.push(f)
    }
    f.show(text, x, y, color)
  }

  /** 屏幕震动：Tween 抖相机的 offset（上一次没抖完先停掉）。 */
  shake(strength: number, duration: number): void {
    this._shake?.kill()
    const rng = this.tree.rng
    const t = this.camera.createTween()
    for (let i = 0; i < 4; i++) {
      const s = strength * (1 - i / 4)
      t.to(this.camera, { offset: v(rng.randfRange(-s, s), rng.randfRange(-s, s)) }, duration / 5)
    }
    this._shake = t.to(this.camera, { offset: Vector2.ZERO }, duration / 5)
  }

  /** 压力测试：放满英雄、一次放 n 只血很厚的怪（看同屏很多怪时的耗时）。 */
  stress(n: number): void {
    this.gold = 1e9
    this.stressMode = true
    const kinds: HeroKind[] = ['archer', 'mage', 'knight']
    this.slots.forEach((slot, i) => this.placeHero(slot, kinds[i % 3]!))
    this.stopSpawning()
    for (let i = 0; i < n; i++) {
      const e = this.spawnEnemy(undefined, 1e6, 40)
      e.dist = this.tree.rng.randfRange(0, e.path.length * 0.8)
    }
  }

  private _updateHud() {
    const h = this._hud
    if (h.gold === this.gold && h.lives === this.lives && h.round === this.round) return
    h.gold = this.gold
    h.lives = this.lives
    h.round = this.round
    this.hud.update(this.gold, this.lives, this.round, { archer: this.stats.archer.cost, mage: this.stats.mage.cost, knight: this.stats.knight.cost })
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), state: this.state, round: this.round, gold: this.gold, lives: this.lives }
  }
}
