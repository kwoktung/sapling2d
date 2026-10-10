import { ColorRect, Ease, Label, Node2D, Sprite2D, v, type Tween, type Vector2 } from 'sapling2d'
import { ART_SCALE, ASSETS } from '../assets'
import { HERO_FEEL, ULT, Z } from '../config'
import { HEROES, RIG, type HeroKind } from '../data/heroes'
import { archerMods, HEADSHOT_EVERY, HEADSHOT_MUL, KNOCKBACK, knightMods, mageMods, QUAKE_EVERY, type ArcherMods, type KnightMods, type MageMods, type RunMods } from '../data/skills'
import type { Shot } from './Arrow'
import type { Blast } from './Effects'
import type { Enemy } from './Enemy'

/** 英雄需要的场景接口（Battle 实现）。 */
export interface HeroWorld {
  /** 这一局的全局倍率（通用选项）。 */
  readonly run: RunMods
  /** 射程内离城门最近（剩余路程最短）的怪物；没有时为 null。 */
  findTarget(x: number, y: number, range: number): Enemy | null
  /** 离 (x, y) 最近的活着的怪物（远程射程内没目标时往它挪）。 */
  nearestEnemy(x: number, y: number): Enemy | null
  /** 骑士要追的怪：从区域里够得着（区域往外扩 `reach`）的地面怪里离城门最近的。 */
  chaseTarget(zone: Zone, reach: number): Enemy | null
  /** 射程内按离城门由近到远排好的怪物（最多 `n` 只，不含 `exclude`）。 */
  findTargets(x: number, y: number, range: number, n: number, exclude: Enemy | null): Enemy[]
  /** 从 (x, y) 向目标射一支箭。 */
  shootArrow(x: number, y: number, target: Enemy, shot: Shot, range: number): void
  /** 从 (x, y) 向目标所在的点扔一个火球（落地爆炸）。 */
  castFireball(x: number, y: number, target: Enemy, blast: Blast): void
  /** 从 (x, y) 放连锁闪电：先打 `first`，再跳 `jumps` 次（每次跳到最近的没打过的敌人），每跳伤害乘 `falloff`。 */
  chainLightning(x: number, y: number, first: Enemy, damage: number, jumps: number, falloff: number): void
  /** 骑士斩击：以 (x, y) 为圆心、朝 `angle`（0 朝上）的扇形（`whirl` 时 360°），打中范围内所有敌人。 */
  slash(hero: Hero, target: Enemy, s: Slash): void
  /** 骑士震地（重击质变）：以骑士为圆心的范围伤害 + 眩晕。 */
  quake(knight: Hero, damage: number): void
  /** [0, 1) 的随机数（tree.rng，测试可复现）。 */
  random(): number
}

/** 一次斩击的效果（骑士出手时算好）。 */
export interface Slash {
  damage: number
  range: number
  arc: number
  whirl: boolean
  knockback: number
  stunChance: number
  stunTime: number
  /** 对眩晕中的敌人伤害倍率。 */
  stunnedMul: number
}

/** 英雄的活动区域（脚底不出这个矩形）。 */
export interface Zone {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

/** 英雄这一局的数值：基础数值乘上技能的修正（`refreshStats()` 重新算）。 */
export interface HeroStats {
  damage: number
  interval: number
  range: number
}

/** 身体的缩放：图集按 2 倍存（`ART_SCALE`），`bodyFlip` 的英雄 x 取反。 */
const bodyScale = (kind: HeroKind, sx: number, sy: number) => v((RIG[kind].bodyFlip ? -sx : sx) * ART_SCALE, sy * ART_SCALE)

/**
 * 英雄：在自己的区域里自动走位（`moveGoal()`，远程和骑士不同），冷却好了就攻击射程内离城门最近的怪物。
 * 身体和武器是两个精灵：攻击时身体下蹲蓄力、出手时拉长、再回弹（补间），武器朝目标转过去并做各自的动作；出手那一刻调用 `release`。
 * 有血条：受伤闪白、脱战回血；血量打光阵亡，原地变成墓碑，倒计时结束复活（回满血、短暂无敌）。
 */
export abstract class Hero extends Node2D {
  readonly stats: HeroStats
  readonly body: Sprite2D
  readonly weapon: Sprite2D
  /** 活动区域；null 表示站着不动（测试用，见 Battle.placeHero 的 `at`）。 */
  zone: Zone | null = null
  /** 待命的位置：没事做时回到这里。 */
  home: Vector2
  cooldown = 0
  attacks = 0
  maxHp: number
  hp: number
  dead = false
  /** 阵亡后还有多久复活、复活后还有多久无敌、离上次挨打多久（脱战回血用）。 */
  respawnLeft = 0
  invulnerableLeft = 0
  sinceHit = Infinity
  readonly hpBack: ColorRect
  readonly hpFill: ColorRect
  readonly tomb: Sprite2D
  readonly countdown: Label
  private _flashLeft = 0
  /** 朝向：1 朝右、-1 朝左（翻转整个英雄节点，武器的位置和旋转跟着镜像）。 */
  facing = 1
  private _anim: Tween | null = null
  private _attacking = false

  constructor(
    protected readonly world: HeroWorld,
    readonly kind: HeroKind,
    position: Vector2,
  ) {
    super({ position, zIndex: position.y })
    const base = HEROES[kind]
    this.stats = { damage: base.damage, interval: base.interval, range: base.range }
    this.home = position
    this.maxHp = this.hp = base.hp
    // 身体的锚点在脚底（美术管线设的 pivot），放在原点就站在槽位上；武器的锚点在握持处，挥动时绕着手转
    this.body = this.add(new Sprite2D({ texture: ASSETS.heroes.get(`${kind}_body`), scale: bodyScale(kind, 1, 1) }))
    const rig = RIG[kind]
    // 武器画在身体后面（zIndex −1）：拳头盖住握柄
    this.weapon = this.add(new Sprite2D({ texture: ASSETS.heroes.get(`${kind}_weapon`), position: v(rig.weaponX, rig.weaponY), scale: v(ART_SCALE, ART_SCALE), zIndex: -1 }))
    const w = HERO_FEEL.barWidth
    this.hpBack = this.add(new ColorRect({ size: v(w, HERO_FEEL.barHeight), color: 0x301818, position: v(-w / 2, -150), visible: false }))
    this.hpFill = this.hpBack.add(new ColorRect({ size: v(w, HERO_FEEL.barHeight), color: 0x60c0ff }))
    // 墓碑和倒计时：阵亡时显示（墓碑画在地上，比怪低：zIndex 是相对英雄的）
    this.tomb = this.add(new Sprite2D({ texture: ASSETS.heroes.get('tombstone'), scale: v(ART_SCALE, ART_SCALE), visible: false }))
    this.countdown = this.add(new Label({ text: '', fontSize: 30, fontWeight: 'bold', color: 0xffffff, align: 'center', verticalAlign: 'center', position: v(0, -96), stroke: { color: 0x000000, width: 5 }, visible: false }))
  }

  /** 受到的伤害乘这个数（基础护甲；骑士再乘守护分支的减伤）。 */
  get armor(): number {
    return HEROES[this.kind].armor
  }

  get speed(): number {
    return HEROES[this.kind].role === 'melee' ? HERO_FEEL.meleeSpeed : HERO_FEEL.rangedSpeed
  }

  override process(dt: number) {
    if (this.dead) {
      this._tickDead(dt)
      return
    }
    this.cooldown -= dt
    this.sinceHit += dt
    if (this.invulnerableLeft > 0) this.invulnerableLeft = Math.max(0, this.invulnerableLeft - dt)
    if (this.sinceHit >= HERO_FEEL.regenDelay && this.hp < this.maxHp) this.heal(this.maxHp * HERO_FEEL.regenRate * dt)
    if (this._flashLeft > 0) {
      this._flashLeft = Math.max(0, this._flashLeft - dt)
      this.body.flash = this._flashLeft / HERO_FEEL.flashTime
    }
    if (!this._attacking && this.zone) this._walk(dt)
    if (this._attacking || this.cooldown > 0) return
    const target = this.world.findTarget(this.x, this.y, this.stats.range)
    if (!target) return
    this.cooldown = this.stats.interval
    this._attack(target)
  }

  /**
   * 这一帧想走到哪（已在区域里）；null 表示不动。默认（远程）：射程内有目标就不动；
   * 没有就往最近的怪挪到它进射程为止（不出区域）；场上没怪就回待命的位置。
   */
  protected moveGoal(zone: Zone): { x: number; y: number } | null {
    if (this.world.findTarget(this.x, this.y, this.stats.range)) return null
    const e = this.world.nearestEnemy(this.x, this.y)
    if (!e) return this.home
    const dx = this.x - e.x
    const dy = this.y - e.y
    const d = Math.hypot(dx, dy) || 1
    const r = this.stats.range * HERO_FEEL.approach
    return { x: clamp(e.x + (dx / d) * r, zone.left, zone.right), y: clamp(e.y + (dy / d) * r, zone.top, zone.bottom) }
  }

  private _walk(dt: number) {
    const zone = this.zone!
    const goal = this.moveGoal(zone)
    if (!goal) return
    const gx = clamp(goal.x, zone.left, zone.right)
    const gy = clamp(goal.y, zone.top, zone.bottom)
    const dx = gx - this.x
    const dy = gy - this.y
    const d = Math.hypot(dx, dy)
    if (d < 1) return
    const step = Math.min(d, this.speed * dt)
    this.x += (dx / d) * step
    this.y += (dy / d) * step
    this.zIndex = this.y
    if (Math.abs(dx) > 1) {
      this.facing = dx < 0 ? -1 : 1
      this.scale = v(this.facing, 1)
    }
  }

  /**
   * 挨打：按护甲减伤，闪白，显示血条；无敌或阵亡时不受伤。返回实际扣掉的血；打光了就阵亡（`dead` 变 true）。
   */
  takeDamage(amount: number): number {
    if (this.dead || this.invulnerableLeft > 0) return 0
    const dealt = Math.min(this.hp, amount * this.armor)
    this.hp -= dealt
    this.sinceHit = 0
    this._flashLeft = HERO_FEEL.flashTime
    this.body.flash = 1
    if (this.hp <= 0) this._die()
    else this._updateBar()
    return dealt
  }

  /** 回血（不超过上限）。 */
  heal(amount: number): void {
    if (this.dead) return
    this.hp = Math.min(this.maxHp, this.hp + amount)
    this._updateBar()
  }

  private _updateBar() {
    const r = this.hp / this.maxHp
    this.hpBack.visible = r < 0.999
    this.hpFill.scale = v(Math.max(0, r), 1)
  }

  private _die() {
    this.hp = 0
    this.dead = true
    this.respawnLeft = HERO_FEEL.respawn
    this.cancelAttack()
    this.body.visible = this.weapon.visible = this.hpBack.visible = false
    this.body.flash = 0
    this._flashLeft = 0
    this.tomb.visible = this.countdown.visible = true
    this.scale = v(1, 1) // 墓碑不翻转
    this.zIndex = Z.tomb
    this.countdown.text = String(Math.ceil(this.respawnLeft))
  }

  private _tickDead(dt: number) {
    this.respawnLeft -= dt
    if (this.respawnLeft > 0) {
      const t = String(Math.ceil(this.respawnLeft))
      if (this.countdown.text !== t) this.countdown.text = t
      return
    }
    this.respawn()
  }

  /** 原地复活：回满血，短暂无敌。 */
  respawn(): void {
    this.dead = false
    this.respawnLeft = 0
    this.hp = this.maxHp
    this.invulnerableLeft = HERO_FEEL.invulnerable
    this.sinceHit = Infinity
    this.body.visible = this.weapon.visible = true
    this.tomb.visible = this.countdown.visible = false
    this.zIndex = this.y
    this._updateBar()
  }

  /** 出手：发射箭 / 火球 / 斩击。`target` 已确认还活着、在射程内（略放宽）。 */
  protected abstract release(target: Enemy): void

  /** 武器在出手前后的角度：默认一直对准目标（`aim`）；骑士覆写成挥砍。 */
  protected weaponAngle(_phase: 'windup' | 'release' | 'rest', aim: number): number {
    return aim
  }

  /** 武器在出手前后的姿势（相对静止姿势的偏移）：子类按武器的样子覆写。 */
  protected weaponPose(phase: 'windup' | 'release' | 'rest'): { dx: number; dy: number } {
    if (phase === 'windup') return { dx: -6, dy: 4 }
    if (phase === 'release') return { dx: 4, dy: -2 }
    return { dx: 0, dy: 0 }
  }

  private _attack(target: Enemy) {
    const rig = RIG[this.kind]
    const speed = Math.max(1, (rig.windup + rig.recover) / this.stats.interval) // 攻速比动作快时整个动作加速
    const windup = rig.windup / speed
    const recover = rig.recover / speed
    this._attacking = true
    this.facing = target.x < this.x ? -1 : 1
    this.scale = v(this.facing, 1)
    // 武器朝目标转过去（贴图朝上；节点翻转后在镜像的坐标里算，所以用 |dx|），限制在 ±70°
    const aim = Math.min(1.2, Math.atan2(Math.abs(target.x - this.x), -(target.y - (this.y + rig.weaponY))))
    this.weapon.rotation = this.weaponAngle('rest', aim)
    const pose = (p: 'windup' | 'release' | 'rest') => {
      const o = this.weaponPose(p)
      return v(rig.weaponX + o.dx, rig.weaponY + o.dy)
    }
    this._anim?.kill()
    this._anim = this.createTween()
      .to(this.body, { scale: bodyScale(this.kind, 1.12, 0.86) }, windup, Ease.QuadOut)
      .parallel()
      .to(this.weapon, { position: pose('windup'), rotation: this.weaponAngle('windup', aim) }, windup, Ease.QuadOut)
      .call(() => this._release(target))
      .to(this.body, { scale: bodyScale(this.kind, 0.92, 1.1) }, recover * 0.35, Ease.QuadOut)
      .parallel()
      .to(this.weapon, { position: pose('release'), rotation: this.weaponAngle('release', aim) }, recover * 0.35, Ease.QuadOut)
      .to(this.body, { scale: bodyScale(this.kind, 1, 1) }, recover * 0.65, Ease.BackOut)
      .parallel()
      .to(this.weapon, { position: pose('rest'), rotation: this.weaponAngle('rest', aim) }, recover * 0.65, Ease.QuadOut)
      .call(() => (this._attacking = false))
  }

  private _release(target: Enemy) {
    let t: Enemy | null = target
    if (t.dead || t.leaked) t = this.world.findTarget(this.x, this.y, this.stats.range * 1.1)
    if (!t) return // 打空
    this.attacks++
    this.release(t)
  }

  /** 停下正在做的动作（阵亡时），回到静止姿势。 */
  cancelAttack(): void {
    this._anim?.kill()
    this._anim = null
    this._attacking = false
    const rig = RIG[this.kind]
    this.body.scale = bodyScale(this.kind, 1, 1)
    this.weapon.position = v(rig.weaponX, rig.weaponY)
    this.weapon.rotation = 0
  }

  /** 这个英雄这一局的技能修正值（`data/skills.ts` 里对应的 `HeroMods[kind]`）。 */
  abstract readonly mods: object

  /**
   * 重新算 `stats` 和血量上限：基础数值 → 这个英雄的技能修正（`applyMods`、`hpMul`）→ 全局倍率（通用选项的伤害、攻速、血量）。
   * 技能或通用选项变了之后调用。上限变大时多出来的血直接加上。
   */
  refreshStats(): void {
    const base = HEROES[this.kind]
    const s = this.stats
    s.damage = base.damage
    s.interval = base.interval
    s.range = base.range
    this.applyMods(s)
    s.damage *= this.world.run.damageMul
    s.interval /= this.world.run.attackSpeedMul
    const maxHp = base.hp * this.hpMul * this.world.run.hpMul
    if (!this.dead) this.hp = Math.max(1, this.hp + maxHp - this.maxHp)
    this.maxHp = maxHp
    this._updateBar()
  }

  /** 这个英雄技能给的血量倍率（骑士的守护分支）。 */
  protected get hpMul(): number {
    return 1
  }

  /** 按这个英雄的技能修正改 `stats`（已经是基础数值）。 */
  protected abstract applyMods(stats: HeroStats): void

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), kind: this.kind, attacks: this.attacks, hp: Math.round(this.hp), dead: this.dead || undefined }
  }
}

/**
 * 弓手：单体追踪箭，射程最远。技能（`mods`）：多重箭（打不同目标）、暴击、每第 5 箭爆头、毒箭、穿透。
 * 每支箭的效果在出手时算好（`Shot`），飞到时由 Battle 结算。
 */
export class Archer extends Hero {
  override readonly mods: ArcherMods = archerMods()
  /** 射出过多少支箭（爆头按它数）。 */
  shots = 0

  constructor(world: HeroWorld, position: Vector2) {
    super(world, 'archer', position)
  }

  protected override applyMods(s: HeroStats): void {
    s.damage *= this.mods.damageMul
    s.range *= this.mods.rangeMul
  }

  protected override release(target: Enemy): void {
    const x = this.x + this.facing * RIG.archer.weaponX
    const y = this.y + RIG.archer.weaponY
    const m = this.mods
    const targets = [target, ...this.world.findTargets(this.x, this.y, this.stats.range, m.arrows - 1, target)]
    for (const t of targets) this.world.shootArrow(x, y, t, this._shot(), this.stats.range)
  }

  /** 这一支箭的效果：爆头（每第 5 箭）、暴击（掷骰）、毒、穿透。 */
  private _shot(): Shot {
    const m = this.mods
    this.shots++
    const headshot = m.headshot && this.shots % HEADSHOT_EVERY === 0
    const crit = !headshot && m.critChance > 0 && this.world.random() < m.critChance
    const damage = this.stats.damage * (headshot ? HEADSHOT_MUL : crit ? m.critMul : 1)
    return { damage, crit, headshot, poison: m.poisonDps > 0 ? { dps: m.poisonDps, time: m.poisonTime, maxStacks: m.poisonStacks } : null, pierce: m.pierce }
  }

  protected override weaponPose(phase: 'windup' | 'release' | 'rest'): { dx: number; dy: number } {
    // 拉弓：弓往身体收、出手时往前送
    if (phase === 'windup') return { dx: -8, dy: 2 }
    if (phase === 'release') return { dx: 6, dy: -2 }
    return { dx: 0, dy: 0 }
  }
}

/** 法师的火球爆炸半径（技能前）。 */
export const MAGE_BLAST = 70

/**
 * 法师：火球飞向目标所在的点，落地范围伤害。技能（`mods`）：烈焰（伤害、半径、燃烧地面）、
 * 寒冰（减速，质变冰冻）、雷电（每隔几次攻击额外放连锁闪电）。
 */
export class Mage extends Hero {
  override readonly mods: MageMods = mageMods()
  /** 第几次攻击（连锁闪电按它数）。 */
  casts = 0

  constructor(world: HeroWorld, position: Vector2) {
    super(world, 'mage', position)
  }

  protected override applyMods(s: HeroStats): void {
    s.damage *= this.mods.damageMul
  }

  get blastRadius(): number {
    return MAGE_BLAST * this.mods.blastMul
  }

  protected override release(target: Enemy): void {
    const m = this.mods
    const x = this.x + this.facing * RIG.mage.weaponX
    const y = this.y + RIG.mage.weaponY - 40 // 宝珠在法杖顶端
    this.casts++
    this.world.castFireball(x, y, target, {
      damage: this.stats.damage,
      radius: this.blastRadius,
      slowPct: m.slowPct,
      slowTime: m.slowTime,
      freeze: m.freeze,
      burnGround: m.burnGround,
    })
    if (m.chainEvery > 0 && this.casts % m.chainEvery === 0) this.world.chainLightning(x, y, target, this.stats.damage, m.chainJumps, m.chainFalloff)
  }

  protected override weaponPose(phase: 'windup' | 'release' | 'rest'): { dx: number; dy: number } {
    // 举起法杖，出手时往前送
    if (phase === 'windup') return { dx: -4, dy: -10 }
    if (phase === 'release') return { dx: 8, dy: 2 }
    return { dx: 0, dy: 0 }
  }
}

/** 骑士的斩击角度（技能前）。 */
export const KNIGHT_ARC = (100 * Math.PI) / 180

/**
 * 骑士：前方扇形斩击（轻微击退，只是打击感）。技能（`mods`）：重击（伤害、眩晕、打眩晕的增伤，质变每第 4 次震地）、
 * 旋风（角度、距离、攻速，质变 360°）、守护（血量、吸血、减伤，质变荆棘反伤）。大招战吼（`warcry`）：减伤 + 回血。
 * 剑的动作是挥砍：往后举起 → 挥过去 → 收回。
 */
export class Knight extends Hero {
  override readonly mods: KnightMods = knightMods()

  constructor(world: HeroWorld, position: Vector2) {
    super(world, 'knight', position)
  }

  protected override applyMods(s: HeroStats): void {
    s.damage *= this.mods.damageMul
    s.range *= this.mods.rangeMul
    s.interval *= this.mods.intervalMul
  }

  protected override get hpMul(): number {
    return this.mods.hpMul
  }

  /**
   * 追从区域里够得着的地面怪里离城门最近的那只（区域往外扩 0.8 个攻击距离：站在区域边上就砍得到）：
   * 走到它在斩击距离内（留点余量，走不出区域）；没有就回待命的位置（区域中心）。
   */
  protected override moveGoal(zone: Zone): { x: number; y: number } | null {
    const e = this.world.chaseTarget(zone, this.stats.range * 0.8)
    if (!e) return this.home
    const dx = this.x - e.x
    const dy = this.y - e.y
    const d = Math.hypot(dx, dy)
    const r = this.stats.range * 0.6
    if (d <= r) return null
    return { x: e.x + (dx / d) * r, y: e.y + (dy / d) * r }
  }

  /** 战吼的减伤还剩几秒。 */
  warcryLeft = 0
  /** 斩击了几次（震地按它数）。 */
  slashes = 0

  /** 战吼：之后 `ULT.warcry.time` 秒受到的伤害减少，立刻回血（嘲讽、拉近、伤害由 Battle 结算）。 */
  warcry(): void {
    this.warcryLeft = ULT.warcry.time
    this.heal(this.maxHp * ULT.warcry.heal)
  }

  override get armor(): number {
    return HEROES.knight.armor * this.mods.damageTakenMul * (this.warcryLeft > 0 ? 1 - ULT.warcry.reduction : 1)
  }

  override process(dt: number) {
    super.process(dt)
    if (this.warcryLeft > 0) this.warcryLeft = Math.max(0, this.warcryLeft - dt)
  }

  protected override release(target: Enemy): void {
    const m = this.mods
    this.slashes++
    this.world.slash(this, target, {
      damage: this.stats.damage,
      range: this.stats.range,
      arc: m.arc,
      whirl: m.whirl,
      knockback: KNOCKBACK,
      stunChance: m.stunChance,
      stunTime: m.stunTime,
      stunnedMul: m.stunnedMul,
    })
    if (m.quake && this.slashes % QUAKE_EVERY === 0) this.world.quake(this, this.stats.damage)
  }

  protected override weaponAngle(phase: 'windup' | 'release' | 'rest', aim: number): number {
    if (phase === 'windup') return aim - 1.4 // 往后举
    if (phase === 'release') return aim + 1 // 挥过去
    return 0
  }

  protected override weaponPose(phase: 'windup' | 'release' | 'rest'): { dx: number; dy: number } {
    if (phase === 'windup') return { dx: -6, dy: -4 }
    if (phase === 'release') return { dx: 10, dy: 0 }
    return { dx: 0, dy: 0 }
  }
}
