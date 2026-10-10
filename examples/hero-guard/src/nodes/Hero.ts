import { Ease, Node2D, rect, Sprite2D, v, type Tween, type Vector2 } from 'sapling2d'
import { ART_SCALE, ASSETS } from '../assets'
import { HEROES, RIG, type HeroKind } from '../data/heroes'
import { archerMods, HEADSHOT_EVERY, HEADSHOT_MUL, KNOCKBACK, knightMods, mageMods, TAUNT_EVERY, type ArcherMods, type KnightMods, type MageMods, type RunMods } from '../data/skills'
import type { Shot } from './Arrow'
import type { Blast } from './Effects'
import type { Enemy } from './Enemy'

/** 英雄需要的场景接口（Battle 实现）。 */
export interface HeroWorld {
  /** 这一局的全局倍率（通用选项）。 */
  readonly run: RunMods
  /** 射程内离城门最近（剩余路程最短）的怪物；没有时为 null。 */
  findTarget(x: number, y: number, range: number): Enemy | null
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
  /** 嘲讽光环：半径内的敌人停下。 */
  tauntAura(x: number, y: number): void
  /** 骑士冲锋这一帧从 y0 冲到 y1：沿线的敌人受伤、击退、眩晕（每次冲锋每只一次）。 */
  chargeSweep(knight: Hero, y0: number, y1: number): void
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
  collide: boolean
  stunChance: number
  stunTime: number
}

/** 英雄这一局的数值：基础数值乘上技能的修正（`refreshStats()` 重新算）。 */
export interface HeroStats {
  damage: number
  interval: number
  range: number
}

/** 身体的缩放：图集按 2 倍存（`ART_SCALE`），`bodyFlip` 的英雄 x 取反。 */
const bodyScale = (kind: HeroKind, sx: number, sy: number) => v((RIG[kind].bodyFlip ? -sx : sx) * ART_SCALE, sy * ART_SCALE)

/**
 * 英雄：站在槽位上，冷却好了就攻击射程内离城门最近的怪物。身体和武器是两个精灵：
 * 攻击时身体下蹲蓄力、出手时拉长、再回弹（补间），武器朝目标转过去并做各自的动作；出手那一刻调用 `release`。
 * 拖动中（`dragging`）不攻击。
 */
export abstract class Hero extends Node2D {
  readonly stats: HeroStats
  readonly body: Sprite2D
  readonly weapon: Sprite2D
  /** 射程圈：拖动时显示。 */
  readonly rangeRing: Sprite2D
  cooldown = 0
  dragging = false
  attacks = 0
  /** 朝向：1 朝右、-1 朝左（翻转整个英雄节点，武器的位置和旋转跟着镜像）。 */
  facing = 1
  private _anim: Tween | null = null
  private _attacking = false

  constructor(
    protected readonly world: HeroWorld,
    readonly kind: HeroKind,
    position: Vector2,
  ) {
    super({ position, zIndex: position.y, inputPickable: true, hitArea: rect(-50, -140, 100, 150) })
    const base = HEROES[kind]
    this.stats = { damage: base.damage, interval: base.interval, range: base.range }
    this.rangeRing = this.add(new Sprite2D({ texture: ASSETS.range, visible: false, zIndex: -2, selfModulate: 0x9fe0ff }))
    // 身体的锚点在脚底（美术管线设的 pivot），放在原点就站在槽位上；武器的锚点在握持处，挥动时绕着手转
    this.body = this.add(new Sprite2D({ texture: ASSETS.heroes.get(`${kind}_body`), scale: bodyScale(kind, 1, 1) }))
    const rig = RIG[kind]
    // 武器画在身体后面（zIndex −1）：拳头盖住握柄
    this.weapon = this.add(new Sprite2D({ texture: ASSETS.heroes.get(`${kind}_weapon`), position: v(rig.weaponX, rig.weaponY), scale: v(ART_SCALE, ART_SCALE), zIndex: -1 }))
  }

  /** 显示 / 隐藏射程圈（按当前射程缩放）。 */
  showRange(show: boolean): void {
    const s = (this.stats.range * 2) / 256
    this.rangeRing.scale = v(s, s)
    this.rangeRing.visible = show
  }

  /** 放大招中（骑士冲锋）：不攻击、不能拖。 */
  busy = false

  override process(dt: number) {
    this.cooldown -= dt
    if (this.dragging || this.busy || this._attacking || this.cooldown > 0) return
    const target = this.world.findTarget(this.x, this.y, this.stats.range)
    if (!target) return
    this.cooldown = this.stats.interval
    this._attack(target)
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

  /** 拖动开始时停下正在做的动作，回到静止姿势。 */
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

  /** 重新算 `stats`：基础数值 → 这个英雄的技能修正（`applyMods`）→ 全局倍率（通用选项的伤害、攻速）。技能或通用选项变了之后调用。 */
  refreshStats(): void {
    const base = HEROES[this.kind]
    const s = this.stats
    s.damage = base.damage
    s.interval = base.interval
    s.range = base.range
    this.applyMods(s)
    s.damage *= this.world.run.damageMul
    s.interval /= this.world.run.attackSpeedMul
  }

  /** 按这个英雄的技能修正改 `stats`（已经是基础数值）。 */
  protected abstract applyMods(stats: HeroStats): void

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), kind: this.kind, attacks: this.attacks }
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
 * 骑士：前方扇形斩击，击退。技能（`mods`）：重击（伤害、击退，质变撞人）、旋风（角度、距离、攻速，质变 360°）、
 * 守护（眩晕，质变每 4 秒嘲讽光环）。剑的动作是挥砍：往后举起 → 挥过去 → 收回。
 */
export class Knight extends Hero {
  override readonly mods: KnightMods = knightMods()
  private _tauntIn = TAUNT_EVERY

  constructor(world: HeroWorld, position: Vector2) {
    super(world, 'knight', position)
  }

  protected override applyMods(s: HeroStats): void {
    s.damage *= this.mods.damageMul
    s.range *= this.mods.rangeMul
    s.interval *= this.mods.intervalMul
  }

  /** 冲锋：竖直冲到 `topY` 再冲回原位（总共 `time` 秒），每帧把这段移动交给 `chargeSweep`；结束时回调 `done`。 */
  charge(topY: number, time: number, done: () => void): void {
    this.cancelAttack()
    this.busy = true
    const homeY = this.y
    const z = this.zIndex
    this.zIndex = 2300
    this._chargeY = homeY
    this.createTween()
      .to(this, { y: topY }, time * 0.45, Ease.QuadIn)
      .to(this, { y: homeY }, time * 0.55, Ease.QuadOut)
      .call(() => {
        this.busy = false
        this.zIndex = z
        this._chargeY = null
        done()
      })
  }

  /** 冲锋中上一帧的 y（null 表示没在冲锋）。 */
  private _chargeY: number | null = null

  override process(dt: number) {
    super.process(dt)
    if (this._chargeY !== null) {
      this.world.chargeSweep(this, this._chargeY, this.y)
      this._chargeY = this.y
    }
    if (!this.mods.taunt || this.dragging || this.busy) return
    this._tauntIn -= dt
    if (this._tauntIn <= 0) {
      this._tauntIn += TAUNT_EVERY
      this.world.tauntAura(this.x, this.y)
    }
  }

  protected override release(target: Enemy): void {
    const m = this.mods
    this.world.slash(this, target, {
      damage: this.stats.damage,
      range: this.stats.range,
      arc: m.arc,
      whirl: m.whirl,
      knockback: KNOCKBACK * m.knockbackMul,
      collide: m.collide,
      stunChance: m.stunChance,
      stunTime: m.stunTime,
    })
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
