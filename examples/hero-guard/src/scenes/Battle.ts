import { Camera2D, ColorRect, HitTester, Node2D, Particles2D, Scene, type Curve2D, type PointerEvent2D, type Tween, v, Vector2 } from 'sapling2d'
import { ASSETS } from '../assets'
import { FEEL, FIELD, SLOTS, START, Z } from '../config'
import { ENEMIES, enemyHp, type EnemyKind } from '../data/enemies'
import type { HeroKind } from '../data/heroes'
import { WAVE_COUNT, WAVES, type SpawnGroup } from '../data/waves'
import { Arrow } from '../nodes/Arrow'
import { Enemy, type EnemyLook } from '../nodes/Enemy'
import { FloatText } from '../nodes/FloatText'
import { Archer, type Hero, type HeroWorld } from '../nodes/Hero'
import { Hud } from '../nodes/Hud'
import { PathPreview } from '../nodes/PathPreview'
import { Slot } from '../nodes/Slot'
import { randomPath } from '../path'

export type BattleState = 'wave' | 'gap' | 'won' | 'lost'

const LOOKS: Record<EnemyKind, EnemyLook> = {
  slime: { texture: ASSETS.slime, halfHeight: 28 },
}

/** 一组怪的出怪进度。 */
interface Spawner {
  group: SpawnGroup
  spawned: number
  next: number
}

/**
 * 战斗场景：20 波怪沿随机曲线下来，英雄站在槽位上自动攻击；越过底线扣命，命用完失败，打完 20 波胜利。
 * 英雄可以拖到别的槽位（拖到有人的槽位就交换）。
 *
 * 场景的 process 先于子节点：这里先出怪、处理上一帧越过底线的怪、清掉死怪、推进波次，然后怪物前进、英雄攻击。
 */
export class Battle extends Scene implements HeroWorld {
  static override assets = ASSETS
  state: BattleState = 'gap'
  lives = START.lives
  wave = 0
  /** 这一局拿到的经验（05 用来升级）和击杀数。 */
  xp = 0
  kills = 0
  readonly enemies: Enemy[] = []
  readonly heroes: Hero[] = []
  readonly slots: Slot[] = []
  hud!: Hud
  camera!: Camera2D
  /** 发光特效的父节点（叠加混合）：火花、光晕。 */
  fx!: Node2D
  sparks!: Particles2D
  debris!: Particles2D
  /** 测试用：不自动出怪、不自动推进波次（见 stopSpawning）。 */
  manual = false
  private _spawners: Spawner[] = []
  private _waveTime = 0
  private _gapLeft = 1
  private readonly _arrows: Arrow[] = []
  private readonly _floats: FloatText[] = []
  private _shake: Tween | null = null
  private _hud = { lives: -1, wave: -1 }
  /** 拖动中的英雄、按下时手指相对英雄的偏移。 */
  private _drag: { hero: Hero; dx: number; dy: number } | null = null

  override ready() {
    this.add(new ColorRect({ name: 'BaseLine', position: v(0, FIELD.baseY), size: v(750, 4), color: 0xc04030, zIndex: Z.slot }))
    let i = 0
    for (const y of SLOTS.rows) for (const x of SLOTS.columns) this.slots.push(this.add(new Slot(i++, v(x, y))))
    this.debris = this.add(
      new Particles2D({ name: 'Debris', texture: ASSETS.spark, emitting: false, zIndex: Z.fx - 1, amount: 400, lifetime: 0.6, lifetimeRandomness: 0.5, speedMin: 100, speedMax: 360, damping: 3, scaleStart: 1.8, scaleEnd: 0.3, alphaEnd: 0, selfModulate: 0x5ab05a }),
    )
    this.fx = this.add(new Node2D({ name: 'Fx', zIndex: Z.fx, blendMode: 'add' }))
    this.sparks = this.fx.add(
      new Particles2D({ name: 'Sparks', texture: ASSETS.spark, emitting: false, amount: 300, lifetime: 0.25, lifetimeRandomness: 0.4, speedMin: 120, speedMax: 320, damping: 6, scaleStart: 1.2, scaleEnd: 0.2, alphaEnd: 0, selfModulate: 0xffe070 }),
    )
    this.camera = this.add(new Camera2D({ position: v(375, 667) }))
    this.hud = this.add(new Hud())
    // 骨架阶段：弓手直接站在上排中间（选英雄在 06 做）
    this.placeHero('archer', this.slots[1]!)
    this._updateHud()
  }

  // ---------------------------------------------------------------- 英雄

  /** 在空槽位上放一个英雄。 */
  placeHero(kind: HeroKind, slot: Slot): Hero {
    if (slot.hero) throw new Error(`slot ${slot.index} is taken`)
    if (kind !== 'archer') throw new Error(`hero ${kind} is not implemented yet`)
    const hero = this.add(new Archer(this, slot.position))
    slot.hero = hero
    this.heroes.push(hero)
    hero.pointerDown.connect((e) => this._beginDrag(hero, e), this)
    hero.pointerMove.connect((e) => this._dragTo(hero, e), this)
    hero.pointerUp.connect((e) => this._endDrag(hero, e), this)
    return hero
  }

  slotOf(hero: Hero): Slot | null {
    return this.slots.find((s) => s.hero === hero) ?? null
  }

  private _beginDrag(hero: Hero, e: PointerEvent2D) {
    if (this._drag || this.state === 'won' || this.state === 'lost') return
    this._drag = { hero, dx: hero.x - e.position.x, dy: hero.y - e.position.y }
    hero.dragging = true
    hero.cancelAttack()
    hero.zIndex = Z.dragging
    hero.showRange(true)
    for (const s of this.slots) s.highlighted = s.hero !== hero
  }

  private _dragTo(hero: Hero, e: PointerEvent2D) {
    const d = this._drag
    if (!d || d.hero !== hero) return
    hero.position = v(e.position.x + d.dx, e.position.y + d.dy)
  }

  /** 松手：落在别的槽位附近就过去（有人就交换），否则回原来的槽位。 */
  private _endDrag(hero: Hero, e: PointerEvent2D) {
    const d = this._drag
    if (!d || d.hero !== hero) return
    this._drag = null
    hero.dragging = false
    hero.showRange(false)
    for (const s of this.slots) s.highlighted = false
    const from = this.slotOf(hero)!
    const to = this.slotNear(e.position.x + d.dx, e.position.y + d.dy) ?? from
    if (to !== from) this.moveHero(hero, to)
    else this._settle(hero, from)
  }

  /** 离 (x, y) 最近、在接住范围内的槽位。 */
  slotNear(x: number, y: number): Slot | null {
    let best: Slot | null = null
    let bestD = SLOTS.radius * 1.6
    for (const s of this.slots) {
      const dist = Math.hypot(s.x - x, s.y - y)
      if (dist < bestD) {
        bestD = dist
        best = s
      }
    }
    return best
  }

  /** 把英雄移到另一个槽位；那里有人就和它交换。 */
  moveHero(hero: Hero, to: Slot): void {
    const from = this.slotOf(hero)!
    const other = to.hero
    to.hero = hero
    from.hero = other
    this._settle(hero, to)
    if (other) this._settle(other, from)
  }

  private _settle(hero: Hero, slot: Slot) {
    hero.position = slot.position
    hero.zIndex = slot.y
  }

  /** 射程内离城门最近（剩余路程最短）的怪物。 */
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

  shootArrow(x: number, y: number, target: Enemy, damage: number): void {
    let a: Arrow | undefined
    for (let i = 0; i < this._arrows.length; i++) {
      if (!this._arrows[i]!.active) {
        a = this._arrows[i]!
        break
      }
    }
    if (!a) {
      a = this.add(new Arrow())
      a.onArrive = this._onArrow
      this._arrows.push(a)
    }
    a.launch(x, y, target, damage)
  }

  private readonly _onArrow = (a: Arrow) => {
    const t = a.target
    if (t && !t.dead && !t.leaked) this.damage(t, a.damage)
  }

  // ---------------------------------------------------------------- 怪物

  /** 出一只怪：默认走一条新的随机路线，出现时路线预览闪一下。 */
  spawnEnemy(kind: EnemyKind, path: Curve2D = randomPath((a, b) => this.tree.rng.randfRange(a, b)), hp = enemyHp(kind, Math.max(1, this.wave))): Enemy {
    this.add(new PathPreview(path))
    const e = this.add(new Enemy(kind, path, hp, LOOKS[kind], this.tree.rng.randfRange(0, Math.PI)))
    this.enemies.push(e)
    return e
  }

  /** 扣血、飘字、火花；打死了加经验、碎片。 */
  damage(e: Enemy, amount: number): void {
    const killed = e.damage(amount)
    this._float(String(Math.round(amount)), e.x, e.y - 50, killed ? 0xffd040 : 0xffffff)
    if (!killed) {
      this.sparks.position = v(e.x, e.y - 24)
      this.sparks.emit(FEEL.sparks)
      return
    }
    this.xp += ENEMIES[e.kind].xp
    this.kills++
    this.debris.position = v(e.x, e.y - 24)
    this.debris.emit(FEEL.debris)
    e.queueFree()
  }

  // ---------------------------------------------------------------- 波次

  /** 测试用：不自动出怪、不推进波次（测试自己放怪）。 */
  stopSpawning(): void {
    this.manual = true
    this._spawners = []
  }

  startWave(n: number): void {
    this.wave = n
    this.state = 'wave'
    this._waveTime = 0
    this._spawners = WAVES[n - 1]!.map((group) => ({ group, spawned: 0, next: group.delay }))
    this.hud.flash(`第 ${n} 波`, 1)
  }

  override process(dt: number) {
    if ((this.state === 'won' || this.state === 'lost') && this.tree.input.isActionJustPressed('confirm')) {
      void this.tree.changeScene(Battle)
      return
    }
    if (!this.manual) this._advanceWaves(dt)
    const enemies = this.enemies
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!
      if (e.leaked && !e.dead) {
        e.dead = true
        e.queueFree()
        this.loseLives(ENEMIES[e.kind].leak)
      }
    }
    HitTester.compact(enemies)
    this._updateHud()
  }

  private _advanceWaves(dt: number) {
    if (this.state === 'gap') {
      this._gapLeft -= dt
      if (this._gapLeft <= 0) this.startWave(this.wave + 1)
      return
    }
    if (this.state !== 'wave') return
    this._waveTime += dt
    let pending = false
    for (const s of this._spawners) {
      while (s.spawned < s.group.count && this._waveTime >= s.next) {
        this.spawnEnemy(s.group.kind)
        s.spawned++
        s.next += s.group.interval
      }
      if (s.spawned < s.group.count) pending = true
    }
    if (pending || this.enemies.some((e) => !e.dead)) return
    if (this.wave >= WAVE_COUNT) {
      this.state = 'won'
      this.hud.flash('胜利！\n点屏幕再来一局', 0)
      return
    }
    this.state = 'gap'
    this._gapLeft = FEEL.waveGap
  }

  loseLives(n: number): void {
    if (this.state === 'lost' || this.state === 'won') return
    this.lives = Math.max(0, this.lives - n)
    this.shake(FEEL.shake, FEEL.shakeTime)
    if (this.lives > 0) return
    this.state = 'lost'
    this.hud.flash('失败\n点屏幕再来一局', 0)
  }

  // ---------------------------------------------------------------- 手感

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

  private _updateHud() {
    const h = this._hud
    if (h.lives === this.lives && h.wave === this.wave) return
    h.lives = this.lives
    h.wave = this.wave
    this.hud.update(this.lives, this.wave, WAVE_COUNT)
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), state: this.state, wave: this.wave, lives: this.lives, xp: this.xp }
  }
}
