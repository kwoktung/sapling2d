import { Camera2D, ColorRect, Ease, HitTester, Node2D, Particles2D, Scene, Sprite2D, type Curve2D, type PointerEvent2D, type Tween, v, Vector2 } from 'sapling2d'
import { ASSETS } from '../assets'
import { FEEL, FIELD, SLOTS, START, ULT, Z } from '../config'
import { ENEMIES, enemyHp, type EnemyKind } from '../data/enemies'
import { HERO_KINDS, HEROES, type HeroKind } from '../data/heroes'
import {
  availableNodes,
  BURN_DPS,
  BURN_TIME,
  CHAIN_RANGE,
  COLLIDE_MUL,
  COLLIDE_RADIUS,
  drawOffers,
  FREEZE_HITS,
  FREEZE_TIME,
  FREEZE_WINDOW,
  POISON_CLOUD_RADIUS,
  POISON_CLOUD_STACKS,
  TAUNT_RADIUS,
  TAUNT_TIME,
  xpToNext,
  type BranchLevels,
  type SkillNode,
} from '../data/skills'
import { WAVE_COUNT, WAVES, type SpawnGroup } from '../data/waves'
import { Arrow, PIERCE_RADIUS, type Shot } from '../nodes/Arrow'
import { BurnZone, Bolt, Fireball, type Blast } from '../nodes/Effects'
import { Enemy, type EnemyLook } from '../nodes/Enemy'
import { FloatText } from '../nodes/FloatText'
import { Archer, Knight, Mage, type Hero, type HeroWorld, type Slash } from '../nodes/Hero'
import { HeroPicker } from '../nodes/HeroPicker'
import { Hud } from '../nodes/Hud'
import { PathPreview } from '../nodes/PathPreview'
import { AimRing, MeteorStrike, RainZone, UltBar } from '../nodes/Ultimates'
import { UpgradePicker } from '../nodes/UpgradePicker'
import { Slot } from '../nodes/Slot'
import { randomPath } from '../path'

/** `choosing` 选英雄、`placing` 点槽位放下选好的英雄、`wave` 出怪中、`gap` 两波之间。 */
export type BattleState = 'choosing' | 'placing' | 'wave' | 'gap' | 'won' | 'lost'

/** 已经实现的英雄；没实现的在选英雄画面里显示“敬请期待”。 */
export const IMPLEMENTED: ReadonlySet<HeroKind> = new Set(['archer', 'mage', 'knight'])

/** 这几波开始前再选一个英雄上场。 */
export const UNLOCK_WAVES: readonly number[] = [3, 6]

/** 中毒每隔多久跳一次伤害。 */
const POISON_TICK = 0.5

/** 怪物的贴图和脚底到贴图中心的距离（占位图的尺寸；12 换成美术管线的图集）。 */
const LOOKS: Record<EnemyKind, EnemyLook> = {
  slime: { texture: ASSETS.slime, halfHeight: 28 },
  bat: { texture: ASSETS.bat, halfHeight: 26 },
  skeleton: { texture: ASSETS.skeleton, halfHeight: 38 },
  splitter: { texture: ASSETS.splitter, halfHeight: 28 },
  smallSlime: { texture: ASSETS.slime, halfHeight: 28 },
  shaman: { texture: ASSETS.shaman, halfHeight: 36 },
  ghost: { texture: ASSETS.ghost, halfHeight: 35 },
}

/** 护甲：弓箭伤害乘这个数。 */
const ARMOR_MUL = 0.5

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
  state: BattleState = 'choosing'
  lives = START.lives
  wave = 0
  /** 这一局拿到的总经验、等级、这一级已经攒了多少、还有几次升级没选。 */
  xp = 0
  level = 1
  levelXp = 0
  pendingLevels = 0
  kills = 0
  /** 每条分支点到第几级（`'archer.multishot' → 2`）、点过的节点（按顺序，结束画面的构筑回顾用）。 */
  readonly branchLevels: BranchLevels = new Map()
  readonly taken: SkillNode[] = []
  picker: UpgradePicker | null = null
  heroPicker: HeroPicker | null = null
  /** 选好了、等着点槽位放下的英雄。 */
  placing: HeroKind | null = null
  /** 燃烧地面（Battle 每 0.5 秒对里面的敌人造成伤害）。 */
  readonly burns: BurnZone[] = []
  /** 大招：每个英雄的能量、上次放大招的游戏时间、充能倍率（通用选项“大招充能 +25%”改它）。 */
  readonly energy: Record<HeroKind, number> = { archer: 0, mage: 0, knight: 0 }
  readonly lastUlt: Record<HeroKind, number> = { archer: -Infinity, mage: -Infinity, knight: -Infinity }
  ultChargeMul = 1
  ultBar!: UltBar
  aimRing!: AimRing
  /** 这次冲锋已经撞过的敌人。 */
  private readonly _charged = new Set<Enemy>()
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
  private readonly _fireballs: Fireball[] = []
  private _burnTick = 0
  private readonly _floats: FloatText[] = []
  private _shake: Tween | null = null
  private _hud = { lives: -1, wave: -1, level: -1, levelXp: -1 }
  /** 拖动中的英雄、按下时手指相对英雄的偏移。 */
  private _drag: { hero: Hero; dx: number; dy: number } | null = null

  override ready() {
    this.add(new ColorRect({ name: 'BaseLine', position: v(0, FIELD.baseY), size: v(750, 4), color: 0xc04030, zIndex: Z.slot }))
    let i = 0
    for (const y of SLOTS.rows) {
      for (const x of SLOTS.columns) {
        const slot = this.add(new Slot(i++, v(x, y)))
        slot.clicked.connect(() => this._onSlotClicked(slot), this)
        this.slots.push(slot)
      }
    }
    this.debris = this.add(
      new Particles2D({ name: 'Debris', texture: ASSETS.spark, emitting: false, zIndex: Z.fx - 1, amount: 400, lifetime: 0.6, lifetimeRandomness: 0.5, speedMin: 100, speedMax: 360, damping: 3, scaleStart: 1.8, scaleEnd: 0.3, alphaEnd: 0, selfModulate: 0x5ab05a }),
    )
    this.fx = this.add(new Node2D({ name: 'Fx', zIndex: Z.fx, blendMode: 'add' }))
    this.sparks = this.fx.add(
      new Particles2D({ name: 'Sparks', texture: ASSETS.spark, emitting: false, amount: 300, lifetime: 0.25, lifetimeRandomness: 0.4, speedMin: 120, speedMax: 320, damping: 6, scaleStart: 1.2, scaleEnd: 0.2, alphaEnd: 0, selfModulate: 0xffe070 }),
    )
    this.camera = this.add(new Camera2D({ position: v(375, 667) }))
    this.hud = this.add(new Hud())
    this.aimRing = this.add(new AimRing())
    this.ultBar = this.add(new UltBar())
    this.ultBar.aimMove.connect((kind, at) => this._aimAt(kind, at), this)
    this.ultBar.aimEnd.connect((kind, at) => this._aimEnd(kind, at), this)
    this.ultBar.cast.connect((kind) => kind === 'knight' && this.knightCharge(), this)
    this._updateHud()
    this.openHeroPicker('选择你的第一位英雄')
  }

  override exitTree() {
    this.tree.timeScale = 1 // 打击停顿中结束这一局（重开）时，不要把停住的时间带到下一局
  }

  // ---------------------------------------------------------------- 选英雄

  /** 还没上场、可以选的英雄。 */
  get unplacedKinds(): HeroKind[] {
    return HERO_KINDS.filter((k) => !this.heroes.some((h) => h.kind === k))
  }

  /** 弹出选英雄画面（剩下的英雄里选）。 */
  openHeroPicker(title: string): void {
    this.state = 'choosing'
    this.heroPicker = this.add(new HeroPicker(this.unplacedKinds, IMPLEMENTED, title))
    this.heroPicker.picked.connect((kind) => this.choose(kind), this)
  }

  /** 选好了英雄：进入放置，空槽位高亮、可以点。 */
  choose(kind: HeroKind): void {
    this.heroPicker = null
    this.placing = kind
    this.state = 'placing'
    for (const s of this.slots) {
      s.highlighted = !s.hero
      s.inputPickable = !s.hero
    }
    this.hud.flash(`点一个槽位放下${HEROES[kind].name}`, 0)
  }

  private _onSlotClicked(slot: Slot) {
    if (this.state !== 'placing' || !this.placing || slot.hero) return
    this.placeHero(this.placing, slot)
    this.placing = null
    for (const s of this.slots) {
      s.highlighted = false
      s.inputPickable = false
    }
    this.hud.flash('', 0)
    // 开局：短暂停顿后第 1 波；解锁：直接开始下一波
    this.state = 'gap'
    this._gapLeft = this.wave === 0 ? 1 : 0.6
  }

  /** 测试用：跳过选英雄，直接把英雄放在第 `slotIndex` 个槽位。 */
  startWith(kind: HeroKind, slotIndex: number): Hero {
    if (this.heroPicker) {
      this.heroPicker.visible = false // queueFree 要到帧末才删：先藏起来，这一帧的点击不会被它的遮罩吃掉
      this.heroPicker.queueFree()
    }
    this.heroPicker = null
    this.choose(kind)
    this._onSlotClicked(this.slots[slotIndex]!)
    return this.heroOf(kind)!
  }

  // ---------------------------------------------------------------- 英雄

  /** 在空槽位上放一个英雄。 */
  placeHero(kind: HeroKind, slot: Slot): Hero {
    if (slot.hero) throw new Error(`slot ${slot.index} is taken`)
    if (!IMPLEMENTED.has(kind)) throw new Error(`hero ${kind} is not implemented yet`)
    const hero = this.add(kind === 'archer' ? new Archer(this, slot.position) : kind === 'mage' ? new Mage(this, slot.position) : new Knight(this, slot.position))
    slot.hero = hero
    this.heroes.push(hero)
    hero.pointerDown.connect((e) => this._beginDrag(hero, e), this)
    hero.pointerMove.connect((e) => this._dragTo(hero, e), this)
    hero.pointerUp.connect((e) => this._endDrag(hero, e), this)
    return hero
  }

  heroOf(kind: HeroKind): Hero | null {
    return this.heroes.find((h) => h.kind === kind) ?? null
  }

  /** 已上场的英雄种类（三选一只出这些英雄的技能）。 */
  get placedKinds(): Set<HeroKind> {
    return new Set(this.heroes.map((h) => h.kind))
  }

  slotOf(hero: Hero): Slot | null {
    return this.slots.find((s) => s.hero === hero) ?? null
  }

  private _beginDrag(hero: Hero, e: PointerEvent2D) {
    if (this._drag || hero.busy || this.state === 'won' || this.state === 'lost' || this.state === 'choosing' || this.state === 'placing') return
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

  findTargets(x: number, y: number, range: number, n: number, exclude: Enemy | null): Enemy[] {
    if (n <= 0) return []
    const r2 = range * range
    const out: Enemy[] = []
    for (const e of this.enemies) {
      if (e === exclude || e.dead || e.leaked) continue
      if ((e.x - x) ** 2 + (e.y - y) ** 2 <= r2) out.push(e)
    }
    out.sort((a, b) => a.remaining - b.remaining)
    return out.slice(0, n)
  }

  random(): number {
    return this.tree.rng.randf()
  }

  shootArrow(x: number, y: number, target: Enemy, shot: Shot, range: number): void {
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
      a.onPierce = this._onPierce
      this._arrows.push(a)
    }
    a.launch(x, y, target, shot, range)
  }

  private readonly _onArrow = (a: Arrow) => {
    const t = a.target
    if (t && !t.dead && !t.leaked) this._arrowHit(t, a.shot)
  }

  /** 穿透箭每帧：碰到的、还没打过的敌人都打一次。 */
  private readonly _onPierce = (a: Arrow) => {
    const r2 = PIERCE_RADIUS * PIERCE_RADIUS
    const enemies = this.enemies
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!
      if (e.dead || a.hit.has(e)) continue
      const dx = e.x - a.x
      const dy = e.y - 24 - a.y
      if (dx * dx + dy * dy > r2) continue
      a.hit.add(e)
      this._arrowHit(e, a.shot)
    }
  }

  private _arrowHit(e: Enemy, shot: Shot) {
    if (shot.poison) this.poison(e, shot.poison.dps, shot.poison.time, shot.poison.maxStacks, 1)
    this.damage(e, shot.damage, { crit: shot.crit || shot.headshot, arrow: true, ignoreArmor: shot.headshot, source: 'archer' })
  }

  // ---------------------------------------------------------------- 法师

  castFireball(x: number, y: number, target: Enemy, blast: Blast): void {
    let f = this._fireballs.find((q) => !q.active)
    if (!f) {
      f = this.fx.add(new Fireball())
      f.onArrive = this._onFireball
      this._fireballs.push(f)
    }
    f.launch(x, y, target, blast)
  }

  /** 火球落地：半径内的敌人受伤、减速（寒冰）、计冰冻次数（寒冰质变）；燃烧地面（烈焰质变）。 */
  private readonly _onFireball = (f: Fireball) => {
    const b = f.blast
    const r2 = b.radius * b.radius
    const enemies = this.enemies
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!
      if (e.dead || (e.x - f.x) ** 2 + (e.y - 20 - f.y) ** 2 > r2) continue
      if (b.slowPct > 0) this.slow(e, b.slowPct, b.slowTime)
      if (b.freeze) this._frostHit(e)
      this.damage(e, b.damage, { source: 'mage' })
    }
    if (b.burnGround) this.burns.push(this.add(new BurnZone(f.x, f.y + 20, b.radius, BURN_TIME)))
    this._burst(f.x, f.y, b.radius, 0xff8030)
  }

  chainLightning(x: number, y: number, first: Enemy, damage: number, jumps: number, falloff: number): void {
    const hit = new Set<Enemy>()
    let fromX = x
    let fromY = y
    let t: Enemy | null = first
    let dmg = damage
    for (let k = 0; k <= jumps && t; k++) {
      hit.add(t)
      this.add(new Bolt(fromX, fromY, t.x, t.y - 24, this.tree.rng.randfRange(-14, 14)))
      fromX = t.x
      fromY = t.y - 24
      this.damage(t, dmg, { source: 'mage' })
      dmg *= falloff
      // 下一跳：离这里最近、没打过的敌人
      let next: Enemy | null = null
      let best = CHAIN_RANGE * CHAIN_RANGE
      for (const e of this.enemies) {
        if (e.dead || hit.has(e)) continue
        const d2 = (e.x - fromX) ** 2 + (e.y - 24 - fromY) ** 2
        if (d2 < best) {
          best = d2
          next = e
        }
      }
      t = next
    }
  }

  // ---------------------------------------------------------------- 骑士

  /**
   * 斩击：以骑士脚底为圆心，半径内、朝目标方向的扇形里（`whirl` 时 360°）的敌人都受伤；
   * 击退（沿各自的路线往回推）、几率眩晕；撞人质变时，被击退的敌人新位置附近的其他敌人受一半伤害。
   */
  slash(hero: Hero, target: Enemy, s: Slash): void {
    const angle = Math.atan2(target.x - hero.x, -(target.y - hero.y)) // 0 = 正上方，和刀光贴图一致
    const reach = s.range + 26 // 加上怪物身体的半径
    const half = s.arc / 2
    const hit: Enemy[] = []
    for (const e of this.enemies) {
      if (e.dead) continue
      const dx = e.x - hero.x
      const dy = e.y - hero.y
      if (dx * dx + dy * dy > reach * reach) continue
      let da = Math.atan2(dx, -dy) - angle
      da = Math.atan2(Math.sin(da), Math.cos(da))
      if (s.whirl || Math.abs(da) <= half || e === target) hit.push(e)
    }
    for (const e of hit) {
      if (this.controllable(e)) {
        e.pushBack(s.knockback)
        if (s.stunChance > 0 && this.tree.rng.randf() < s.stunChance) this.stun(e, s.stunTime)
      }
      this.damage(e, s.damage, { source: 'knight' })
    }
    if (s.collide) {
      for (const e of hit) {
        if (e.dead || !this.controllable(e)) continue
        for (const o of this.enemies) {
          if (o === e || o.dead || hit.includes(o)) continue
          if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= COLLIDE_RADIUS ** 2) this.damage(o, s.damage * COLLIDE_MUL, { source: 'knight' })
        }
      }
    }
    this._slashFx(hero, angle, s)
  }

  /** 刀光：120° 的弧，叠加发光、按距离缩放；360° 时三片拼成一圈。 */
  private _slashFx(hero: Hero, angle: number, s: Slash) {
    const scale = ((s.range + 26) * 2) / 200
    const pieces = s.whirl ? [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3] : [0]
    for (const p of pieces) {
      const fx = this.fx.add(new Sprite2D({ texture: ASSETS.slash, position: v(hero.x, hero.y - 30), rotation: angle + p, scale: v(scale * 0.8, scale * 0.8), selfModulate: 0xb8d8ff }))
      fx.createTween().to(fx, { scale: v(scale, scale), alpha: 0 }, 0.2, Ease.QuadOut).call(() => fx.queueFree())
    }
  }

  tauntAura(x: number, y: number): void {
    for (const e of this.enemies) {
      if (e.dead || !this.controllable(e) || (e.x - x) ** 2 + (e.y - y) ** 2 > TAUNT_RADIUS ** 2) continue
      e.tauntLeft = Math.max(e.tauntLeft, TAUNT_TIME)
      this._tint(e)
    }
    const s = (TAUNT_RADIUS * 2) / 256
    const ring = this.fx.add(new Sprite2D({ texture: ASSETS.range, position: v(x, y - 20), scale: v(s * 0.3, s * 0.3), selfModulate: 0xffc060 }))
    ring.createTween().to(ring, { scale: v(s, s), alpha: 0 }, 0.4, Ease.QuadOut).call(() => ring.queueFree())
  }

  stun(e: Enemy, time: number): void {
    if (e.dead || !this.controllable(e)) return
    e.stunLeft = Math.max(e.stunLeft, time)
    this._tint(e)
  }

  /** 爆炸特效：放大淡出的光圈（叠加发光）+ 火花。 */
  private _burst(x: number, y: number, radius: number, color: number) {
    const s = (radius * 2) / 64
    const fx = this.fx.add(new Sprite2D({ texture: ASSETS.glow, position: v(x, y), scale: v(s * 0.4, s * 0.4), selfModulate: color }))
    fx.createTween().to(fx, { scale: v(s, s), alpha: 0 }, 0.3, Ease.QuadOut).call(() => fx.queueFree())
    this.sparks.position = v(x, y)
    this.sparks.emit(FEEL.sparks * 2)
  }

  // ---------------------------------------------------------------- 状态

  /** 能不能被控制（减速、冰冻、眩晕、击退、嘲讽）：幽灵免疫。 */
  controllable(e: Enemy): boolean {
    return !ENEMIES[e.kind].immune
  }

  /** 减速：取更强的那个比例，刷新时间。 */
  slow(e: Enemy, pct: number, time: number): void {
    if (e.dead || !this.controllable(e)) return
    e.slowPct = Math.max(e.slowPct, pct)
    e.slowLeft = Math.max(e.slowLeft, time)
    this._tint(e)
  }

  /** 寒冰质变：2 秒窗口里被打满 3 次就冰冻。 */
  private _frostHit(e: Enemy) {
    if (e.dead || !this.controllable(e)) return
    const now = this.tree.time
    if (e.frostWindowStart < 0 || now - e.frostWindowStart > FREEZE_WINDOW) {
      e.frostWindowStart = now
      e.frostHits = 0
    }
    if (++e.frostHits >= FREEZE_HITS) {
      e.frozenLeft = FREEZE_TIME
      e.frostHits = 0
      e.frostWindowStart = -1
      this._tint(e)
    }
  }

  /** 身上状态的颜色：冰冻 > 眩晕 > 嘲讽 > 减速 > 中毒。 */
  private _tint(e: Enemy) {
    e.body.selfModulate =
      e.frozenLeft > 0 ? 0x80c0ff : e.stunLeft > 0 ? 0xfff080 : e.tauntLeft > 0 ? 0xffb070 : e.slowPct > 0 ? 0xbfe0ff : e.poisonStacks > 0 ? 0xb0ff90 : 0xffffff
  }

  /** 治疗光环的计时：每 0.5 秒结算一次（开局先等 0.5 秒）。 */
  private _healTick = POISON_TICK

  /** 萨满的治疗光环：每 0.5 秒给半径内的其他怪回血，萨满身上闪一圈绿光。 */
  private _tickHeal(dt: number) {
    this._healTick -= dt
    if (this._healTick > 0) return
    this._healTick += POISON_TICK
    for (const s of this.enemies) {
      const heal = ENEMIES[s.kind].heal
      if (!heal || s.dead) continue
      const r2 = heal.radius * heal.radius
      let healed = false
      for (const e of this.enemies) {
        if (e === s || e.dead || e.hp >= e.maxHp || (e.x - s.x) ** 2 + (e.y - s.y) ** 2 > r2) continue
        e.heal(heal.perSecond * POISON_TICK)
        healed = true
      }
      if (healed) {
        const k = (heal.radius * 2) / 256
        const ring = this.fx.add(new Sprite2D({ texture: ASSETS.range, position: v(s.x, s.y - 20), scale: v(k * 0.4, k * 0.4), selfModulate: 0x60ff80, alpha: 0.8 }))
        ring.createTween().to(ring, { scale: v(k, k), alpha: 0 }, 0.4, Ease.QuadOut).call(() => ring.queueFree())
      }
    }
  }

  /** 加 `stacks` 层毒（不超过上限），刷新持续时间；伤害按最强的那一份毒算。 */
  poison(e: Enemy, dps: number, time: number, maxStacks: number, stacks: number): void {
    if (e.dead) return
    if (e.poisonStacks === 0) e.poisonTick = POISON_TICK
    e.poisonStacks = Math.min(maxStacks, e.poisonStacks + stacks)
    e.poisonLeft = time
    e.poisonDps = Math.max(e.poisonDps, dps)
    this._tint(e)
  }

  /** 每帧结算怪物身上的持续状态（中毒每 0.5 秒跳一次伤害、减速和冰冻的计时）和燃烧地面。 */
  private _tickStatuses(dt: number) {
    const enemies = this.enemies
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!
      if (e.dead) continue
      let changed = false
      if (e.frozenLeft > 0 && (e.frozenLeft -= dt) <= 0) {
        e.frozenLeft = 0
        changed = true
      }
      if (e.stunLeft > 0 && (e.stunLeft -= dt) <= 0) {
        e.stunLeft = 0
        changed = true
      }
      if (e.tauntLeft > 0 && (e.tauntLeft -= dt) <= 0) {
        e.tauntLeft = 0
        changed = true
      }
      if (e.slowLeft > 0 && (e.slowLeft -= dt) <= 0) {
        e.slowLeft = 0
        e.slowPct = 0
        changed = true
      }
      if (e.poisonStacks > 0) {
        e.poisonLeft -= dt
        e.poisonTick -= dt
        if (e.poisonTick <= 0) {
          e.poisonTick += POISON_TICK
          this.damage(e, e.poisonStacks * e.poisonDps * POISON_TICK, { dot: true, source: 'archer' })
        }
        if (e.poisonLeft <= 0 && !e.dead) {
          e.poisonStacks = 0
          e.poisonDps = 0
          changed = true
        }
      }
      if (changed && !e.dead) this._tint(e)
    }
    this._tickHeal(dt)
    // 燃烧地面：每 0.5 秒对里面的敌人造成伤害
    if (!this.burns.length) return
    this._burnTick -= dt
    if (this._burnTick > 0) return
    this._burnTick += POISON_TICK
    for (const z of this.burns) {
      if (!z.burning) continue
      const r2 = z.radius * z.radius
      for (const e of enemies) if (!e.dead && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= r2) this.damage(e, BURN_DPS * POISON_TICK, { dot: true, source: 'mage' })
    }
    for (let i = this.burns.length - 1; i >= 0; i--) if (!this.burns[i]!.burning) this.burns.splice(i, 1)
  }

  // ---------------------------------------------------------------- 怪物

  /** 出一只怪：默认走一条新的随机路线，出现时路线预览闪一下。`preview: false` 时不显示路线（分裂出来的小怪）。 */
  spawnEnemy(kind: EnemyKind, path: Curve2D = randomPath((a, b) => this.tree.rng.randfRange(a, b)), hp?: number, elite = false, preview = true): Enemy {
    if (preview) this.add(new PathPreview(path))
    const e = this.add(new Enemy(kind, path, hp ?? enemyHp(kind, Math.max(1, this.wave), elite), LOOKS[kind], this.tree.rng.randfRange(0, Math.PI), elite))
    this.enemies.push(e)
    return e
  }

  /**
   * 扣血、飘字、火花；打死了加经验、碎片、分裂。`crit` 飘字大一号带感叹号，`dot`（中毒等持续伤害）绿色、没有火花。
   * `arrow`：弓箭伤害（普通箭、箭雨），打护甲减半（飘字灰色），`ignoreArmor`（爆头）不减。`source`：哪个英雄打的（充大招能量）。
   */
  damage(e: Enemy, raw: number, opts: { crit?: boolean; dot?: boolean; arrow?: boolean; ignoreArmor?: boolean; source?: HeroKind } = {}): void {
    if (e.dead) return
    const armored = !!opts.arrow && !opts.ignoreArmor && !!ENEMIES[e.kind].armor
    const amount = armored ? raw * ARMOR_MUL : raw
    if (opts.source) this.chargeUlt(opts.source, Math.min(amount, e.hp))
    const killed = e.damage(amount)
    const text = opts.crit ? `${Math.round(amount)}!` : String(Math.round(amount))
    const color = opts.dot ? 0x90ff70 : armored ? 0xa0a0a0 : opts.crit ? 0xffb030 : killed ? 0xffd040 : 0xffffff
    this._float(text, e.x, e.y - 50, color, opts.crit ? 1.4 : opts.dot || armored ? 0.8 : 1)
    if (!killed) {
      if (!opts.dot) {
        this.sparks.position = v(e.x, e.y - 24)
        this.sparks.emit(FEEL.sparks)
      }
      return
    }
    this.kills++
    this.debris.position = v(e.x, e.y - 24)
    this.debris.emit(FEEL.debris)
    e.queueFree()
    // 毒雾：中毒的敌人死亡时，周围的敌人中毒
    const archer = this.heroOf('archer') as Archer | null
    if (e.poisonStacks > 0 && archer?.mods.poisonCloud) {
      const m = archer.mods
      for (const o of this.enemies) {
        if (o !== e && !o.dead && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= POISON_CLOUD_RADIUS ** 2) this.poison(o, m.poisonDps, m.poisonTime, m.poisonStacks, POISON_CLOUD_STACKS)
      }
      this.sparks.position = v(e.x, e.y - 24)
      this.sparks.emit(FEEL.sparks * 2)
    }
    // 分裂：在原路线上前后错开出几只小怪（不显示路线预览）
    const split = ENEMIES[e.kind].split
    if (split) {
      for (let i = 0; i < split.count; i++) {
        const child = this.spawnEnemy(split.kind, e.path, enemyHp(split.kind, Math.max(1, this.wave)), false, false)
        child.dist = Math.max(0, e.dist + (i - (split.count - 1) / 2) * 30)
        child.pushBack(0)
      }
    }
    this.gainXp(e.xp)
  }

  // ---------------------------------------------------------------- 经验和升级

  /** 加经验；够了就升级（可能一次升好几级，三选一依次弹出）。 */
  gainXp(n: number): void {
    this.xp += n
    this.levelXp += n
    while (this.levelXp >= xpToNext(this.level)) {
      this.levelXp -= xpToNext(this.level)
      this.level++
      this.pendingLevels++
    }
  }

  // ---------------------------------------------------------------- 大招

  /** 英雄造成伤害时积攒能量。 */
  chargeUlt(kind: HeroKind, damage: number): void {
    this.energy[kind] = Math.min(ULT.energyMax, this.energy[kind] + (damage / ULT.damagePerEnergy) * this.ultChargeMul)
  }

  /** 能不能放：英雄在场上、能量满了、离上次放够 12 秒、不在升级弹窗里。 */
  canUlt(kind: HeroKind): boolean {
    return !!this.heroOf(kind) && this.energy[kind] >= ULT.energyMax && this.tree.time - this.lastUlt[kind] >= ULT.minInterval && !this.picker && (this.state === 'wave' || this.state === 'gap')
  }

  private _consume(kind: HeroKind) {
    this.energy[kind] = 0
    this.lastUlt[kind] = this.tree.time
  }

  private _aimAt(kind: HeroKind, design: Vector2) {
    const at = this.tree.viewport.designToWorld(design)
    this.aimRing.showAt(at.x, at.y, kind === 'archer' ? ULT.rain.radius : ULT.meteor.radius)
  }

  private _aimEnd(kind: HeroKind, design: Vector2 | null) {
    this.aimRing.visible = false
    if (!design) return
    const at = this.tree.viewport.designToWorld(design)
    if (kind === 'archer') this.arrowRain(at.x, at.y)
    else if (kind === 'mage') this.meteor(at.x, at.y)
  }

  /** 弓手箭雨：2 秒内 10 轮，每轮对圈里所有敌人造成弓手伤害 × 2.5。 */
  arrowRain(x: number, y: number): boolean {
    const archer = this.heroOf('archer')
    if (!archer || !this.canUlt('archer')) return false
    this._consume('archer')
    const damage = archer.stats.damage * ULT.rain.mul
    this.add(
      new RainZone(x, y, ULT.rain.radius, (cx, cy, r) => {
        for (const e of this.enemies) if (!e.dead && (e.x - cx) ** 2 + (e.y - cy) ** 2 <= r * r) this.damage(e, damage, { arrow: true })
      }, (a, b) => this.tree.rng.randfRange(a, b)),
    )
    return true
  }

  /** 法师陨石：0.8 秒后落地，半径内敌人受法师伤害 × 16，屏幕震动 + 打击停顿。 */
  meteor(x: number, y: number): boolean {
    const mage = this.heroOf('mage')
    if (!mage || !this.canUlt('mage')) return false
    this._consume('mage')
    const damage = mage.stats.damage * ULT.meteor.mul
    this.add(
      new MeteorStrike(x, y, ULT.meteor.radius, (cx, cy) => {
        const r2 = ULT.meteor.radius ** 2
        for (const e of this.enemies) if (!e.dead && (e.x - cx) ** 2 + (e.y - cy) ** 2 <= r2) this.damage(e, damage)
        this._burst(cx, cy, ULT.meteor.radius, 0xff6020)
        this.shake(FEEL.shake * 1.6, FEEL.shakeTime * 1.4)
        this.hitStop(ULT.meteor.hitStop)
      }),
    )
    return true
  }

  /** 骑士冲锋：竖直冲到顶再回来，沿线的敌人受骑士伤害 × 4、击退 60、眩晕 1.5 秒（幽灵只受伤害）。 */
  knightCharge(): boolean {
    const knight = this.heroOf('knight') as Knight | null
    if (!knight || !this.canUlt('knight')) return false
    this._consume('knight')
    this._charged.clear()
    knight.charge(ULT.charge.topY, ULT.charge.time, () => this._charged.clear())
    return true
  }

  chargeSweep(knight: Hero, y0: number, y1: number): void {
    const half = ULT.charge.width / 2
    const lo = Math.min(y0, y1) - 30
    const hi = Math.max(y0, y1) + 30
    for (const e of this.enemies) {
      if (e.dead || this._charged.has(e) || Math.abs(e.x - knight.x) > half || e.y < lo || e.y > hi) continue
      this._charged.add(e)
      if (this.controllable(e)) {
        e.pushBack(ULT.charge.knockback)
        this.stun(e, ULT.charge.stun)
      }
      this.damage(e, knight.stats.damage * ULT.charge.mul)
    }
  }

  /** 打击停顿：游戏时间停一小会儿（按真实时间恢复；用 timeout.connect 不用 await，无头测试里也能恢复）。 */
  hitStop(seconds: number): void {
    this.tree.timeScale = 0
    this.tree.createTimer(seconds, { ignoreTimeScale: true }).timeout.connect(() => (this.tree.timeScale = 1), this)
  }

  /** 弹出三选一：游戏暂停，选完继续。没有可选的节点时这次升级直接跳过。 */
  openPicker(): void {
    this.ultBar.cancelAim()
    const offers = drawOffers(availableNodes(this.placedKinds, this.branchLevels), 3, (n) => this.tree.rng.randiRange(0, n - 1))
    const level = this.level - this.pendingLevels + 1
    this.pendingLevels--
    if (!offers.length) return
    this.tree.paused = true
    this.picker = this.add(new UpgradePicker(offers, level))
    this.picker.picked.connect((node) => this.applySkill(node), this)
  }

  /** 点一个技能节点：改对应英雄的修正值。 */
  applySkill(node: SkillNode): void {
    this.branchLevels.set(`${node.hero}.${node.branch}`, node.level)
    this.taken.push(node)
    const hero = this.heroOf(node.hero)
    if (hero) {
      // 节点只会出现给已上场的英雄，hero.mods 就是这个节点要改的那一份
      ;(node.apply as (m: object) => void)(hero.mods)
      hero.refreshStats()
    }
    this.picker = null
    this.tree.paused = false
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
    this._tickStatuses(dt)
    const enemies = this.enemies
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!
      if (e.leaked && !e.dead) {
        e.dead = true
        e.queueFree()
        this.loseLives(e.leak)
      }
    }
    HitTester.compact(enemies)
    if (this.pendingLevels > 0 && !this.picker && this.state !== 'won' && this.state !== 'lost') this.openPicker()
    this._updateHud()
  }

  private _advanceWaves(dt: number) {
    if (this.state === 'gap') {
      this._gapLeft -= dt
      if (this._gapLeft > 0) return
      const next = this.wave + 1
      // 第 3、6 波前再选一个英雄（还有能选的才弹）
      const due = UNLOCK_WAVES.filter((w) => w <= next).length + 1
      if (UNLOCK_WAVES.includes(next) && this.heroes.length < due && this.unplacedKinds.some((k) => IMPLEMENTED.has(k))) {
        this.openHeroPicker(`第 ${next} 波：再选一位英雄`)
        return
      }
      this.startWave(next)
      return
    }
    if (this.state !== 'wave') return
    this._waveTime += dt
    let pending = false
    for (const s of this._spawners) {
      while (s.spawned < s.group.count && this._waveTime >= s.next) {
        this.spawnEnemy(s.group.kind, undefined, undefined, !!s.group.elite)
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

  private _float(text: string, x: number, y: number, color: number, size = 1) {
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
    f.scale = v(size, size)
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
    for (const k of HERO_KINDS) this.ultBar.buttons[k].update(!!this.heroOf(k), this.energy[k] / ULT.energyMax, this.canUlt(k))
    const h = this._hud
    if (h.lives === this.lives && h.wave === this.wave && h.level === this.level && h.levelXp === this.levelXp) return
    h.lives = this.lives
    h.wave = this.wave
    h.level = this.level
    h.levelXp = this.levelXp
    this.hud.update(this.lives, this.wave, WAVE_COUNT)
    this.hud.updateXp(this.level, this.levelXp / xpToNext(this.level))
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), state: this.state, wave: this.wave, lives: this.lives, level: this.level, xp: this.xp }
  }
}
