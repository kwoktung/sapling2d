import { AudioStreamPlayer, Camera2D, Ease, HitTester, Node2D, Particles2D, Scene, Sprite2D, type Curve2D, type PointerEvent2D, type Tween, v, Vector2 } from 'sapling2d'
import { ASSETS } from '../assets'
import { AGGRO, FEEL, FIELD, PATH, PORTAL, START, ULT, Z, ZONES } from '../config'
import { ELITE, ENEMIES, enemyHp, type EnemyKind } from '../data/enemies'
import { HERO_KINDS, HEROES, type HeroKind } from '../data/heroes'
import {
  availableNodes,
  BURN_DPS,
  BURN_TIME,
  CHAIN_RANGE,
  drawOffers,
  isGeneric,
  FREEZE_HITS,
  FREEZE_TIME,
  FREEZE_WINDOW,
  POISON_CLOUD_RADIUS,
  POISON_CLOUD_STACKS,
  runMods,
  QUAKE_RADIUS,
  QUAKE_MUL,
  QUAKE_STUN,
  xpToNext,
  type BranchLevels,
  type GenericOption,
  type Offer,
  type RunMods,
  type SkillNode,
} from '../data/skills'
import { WAVE_COUNT, WAVES, type SpawnGroup } from '../data/waves'
import { Arrow, PIERCE_RADIUS, type Shot } from '../nodes/Arrow'
import { BurnZone, Bolt, Fireball, type Blast } from '../nodes/Effects'
import { Enemy, type EnemyLook } from '../nodes/Enemy'
import { FloatText } from '../nodes/FloatText'
import { Archer, Knight, Mage, type Hero, type HeroWorld, type Slash, type Zone } from '../nodes/Hero'
import { HeroPicker } from '../nodes/HeroPicker'
import { Hud } from '../nodes/Hud'
import { PathPreview } from '../nodes/PathPreview'
import { ResultPanel } from '../nodes/ResultPanel'
import { AimRing, MeteorStrike, RainZone, UltBar } from '../nodes/Ultimates'
import { UpgradePicker } from '../nodes/UpgradePicker'
import { randomPath } from '../path'
import { BGM, BGM_VOLUME, playSound, SOUND_ASSETS, type SoundName } from '../sounds'

/** 特效贴图里图案的半径（像素，贴图按 2 倍存）：按它把特效缩放到想要的范围。 */
const SLASH_R = 149
const EXPLOSION_R = 179
const ICE_R = 102
const POISON_R = 84
/** 背景贴图的尺寸、城墙顶的高度（像素）。 */
const BG_W = 1500
const BG_H = 2688
const BG_WALL_Y = 2300
/** 背景贴图里传送门（黑洞）的中心（像素）。 */
const BG_PORTAL = { x: 745, y: 218 }
/** 刀光贴图的弧顶朝下偏右 160°：转回朝上（和 `angle` 的约定一致）。 */
const SLASH_TURN = (-160 * Math.PI) / 180

/** `choosing` 选英雄、`wave` 出怪中、`gap` 两波之间。 */
export type BattleState = 'choosing' | 'wave' | 'gap' | 'won' | 'lost'

/** 已经实现的英雄；没实现的在选英雄画面里显示“敬请期待”。 */
export const IMPLEMENTED: ReadonlySet<HeroKind> = new Set(['archer', 'mage', 'knight'])

/** 这几波开始前再选一个英雄上场。 */
export const UNLOCK_WAVES: readonly number[] = [3, 6]

/** 中毒每隔多久跳一次伤害。 */
const POISON_TICK = 0.5

/** 怪物的贴图：`enemies` 图集的帧（小史莱姆用史莱姆的图，在数据里缩小）。 */
const LOOKS: Record<EnemyKind, EnemyLook> = {
  slime: { texture: ASSETS.enemies.get('enemy_slime') },
  bat: { texture: ASSETS.enemies.get('enemy_bat') },
  skeleton: { texture: ASSETS.enemies.get('enemy_skeleton'), walk: ASSETS.enemies.frames('walk_skeleton_') },
  splitter: { texture: ASSETS.enemies.get('enemy_splitter') },
  smallSlime: { texture: ASSETS.enemies.get('enemy_slime') },
  shaman: { texture: ASSETS.enemies.get('enemy_shaman'), walk: ASSETS.enemies.frames('walk_shaman_') },
  ghost: { texture: ASSETS.enemies.get('enemy_ghost') },
  slimeKing: { texture: ASSETS.enemies.get('enemy_slimeKing') },
  lich: { texture: ASSETS.enemies.get('enemy_lich') },
}

/** 死掉的、巫妖可以复活的怪：在哪条路线的哪里、什么时候死的。 */
interface Grave {
  kind: EnemyKind
  path: Curve2D
  dist: number
  x: number
  y: number
  time: number
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
 * 战斗场景：20 波怪沿随机曲线下来，英雄在自己的区域里自动走位、攻击；地面怪会离开路线围攻附近的英雄。
 * 越过底线扣命，命用完失败，打完 20 波胜利。
 *
 * 场景的 process 先于子节点：这里先出怪、处理上一帧越过底线的怪、清掉死怪、推进波次，然后怪物前进、英雄攻击。
 */
export class Battle extends Scene implements HeroWorld {
  static override assets = { ...ASSETS, ...SOUND_ASSETS }
  state: BattleState = 'choosing'
  lives = START.lives
  wave = 0
  /** 这一局拿到的总经验、等级、这一级已经攒了多少、还有几次升级没选。 */
  xp = 0
  level = 1
  levelXp = 0
  pendingLevels = 0
  kills = 0
  /** 每条分支点到第几级（`'archer.multishot' → 2`）、选过的选项（按顺序，结束画面的构筑回顾用）。 */
  readonly branchLevels: BranchLevels = new Map()
  readonly taken: Offer[] = []
  /** 这一局的全局倍率（通用选项改它）。 */
  readonly run: RunMods = runMods()
  /** 这一局打了多久（秒，只算波次中和波次间）。 */
  runTime = 0
  result: ResultPanel | null = null
  picker: UpgradePicker | null = null
  heroPicker: HeroPicker | null = null
  /** 燃烧地面（Battle 每 0.5 秒对里面的敌人造成伤害）。 */
  readonly burns: BurnZone[] = []
  /** 大招：每个英雄的能量、上次放大招的游戏时间、充能倍率（通用选项“大招充能 +25%”改它）。 */
  readonly energy: Record<HeroKind, number> = { archer: 0, mage: 0, knight: 0 }
  readonly lastUlt: Record<HeroKind, number> = { archer: -Infinity, mage: -Infinity, knight: -Infinity }
  ultBar!: UltBar
  aimRing!: AimRing
  /** 场上的 Boss（顶部血条显示它）。 */
  boss: Enemy | null = null
  /** 最近死掉的、可以被复活的怪（巫妖用）。 */
  readonly graves: Grave[] = []
  readonly enemies: Enemy[] = []
  readonly heroes: Hero[] = []
  hud!: Hud
  camera!: Camera2D
  /** 发光特效的父节点（叠加混合）：火花、光晕。 */
  fx!: Node2D
  sparks!: Particles2D
  debris!: Particles2D
  background!: Sprite2D
  /** 传送门（背景里的黑洞）中心的世界坐标：怪物从这里出现（随背景布局变）。 */
  portal = v(375, 0)
  music!: AudioStreamPlayer
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

  override ready() {
    this.music = this.add(new AudioStreamPlayer({ name: 'Music', stream: BGM, loop: true, volume: BGM_VOLUME, autoplay: true }))
    this.background = this.add(new Sprite2D({ name: 'Background', texture: ASSETS.bg, zIndex: Z.background }))
    this._layoutBackground()
    this.tree.viewport.resized.connect(() => this._layoutBackground(), this)
    this.debris = this.add(
      new Particles2D({ name: 'Debris', texture: ASSETS.spark, emitting: false, zIndex: Z.fx - 1, amount: 400, lifetime: 0.6, lifetimeRandomness: 0.5, speedMin: 100, speedMax: 360, damping: 3, scaleStart: 1.8, scaleEnd: 0.3, alphaEnd: 0, selfModulate: 0x5ab05a }),
    )
    this.fx = this.add(new Node2D({ name: 'Fx', zIndex: Z.fx, blendMode: 'add' }))
    this.sparks = this.fx.add(
      new Particles2D({ name: 'Sparks', texture: ASSETS.spark, emitting: false, amount: 300, lifetime: 0.25, lifetimeRandomness: 0.4, speedMin: 120, speedMax: 320, damping: 6, scaleStart: 1.2, scaleEnd: 0.2, alphaEnd: 0, selfModulate: 0xffe070 }),
    )
    this.camera = this.add(new Camera2D({ position: v(375, 667) }))
    this.hud = this.add(new Hud())
    this._applyMute()
    this.hud.toggle.connect((bus) => {
      const key = bus === 'Music' ? 'musicMuted' : 'sfxMuted'
      this.tree.storage.set(key, !this.tree.storage.get(key, false))
      this._applyMute()
      this.sound('button')
    }, this)
    this.aimRing = this.add(new AimRing())
    this.ultBar = this.add(new UltBar())
    this.ultBar.aimMove.connect((kind, at) => this._aimAt(kind, at), this)
    this.ultBar.aimEnd.connect((kind, at) => this._aimEnd(kind, at), this)
    this.ultBar.aimWait.connect((kind) => this._aimWait(kind), this)
    this.ultBar.cast.connect((kind) => kind === 'knight' && this.warCry(), this)
    this._updateHud()
    this.openHeroPicker('选择你的第一位英雄')
  }

  /**
   * 背景：贴图 1500×2688，城墙顶在贴图 y≈2300。把城墙顶对齐到底线 `FIELD.baseY` 下面一点（怪物走到城墙才扣命），
   * 再放大到盖住左右和顶部（多 4%：屏幕震动时不露边）。比贴图更长的屏幕底下会露出一条，用游戏的背景色（城墙底部的颜色）补上。
   */
  private _layoutBackground() {
    const r = this.tree.viewport.visibleRect
    const wall = FIELD.baseY + 30
    const k = Math.max(r.width / BG_W, (wall - r.top) / BG_WALL_Y) * 1.04
    this.background.scale = v(k, k)
    this.background.position = v(375, wall - (BG_WALL_Y - BG_H / 2) * k)
    this.portal = v(375 + (BG_PORTAL.x - BG_W / 2) * k, this.background.y + (BG_PORTAL.y - BG_H / 2) * k)
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

  /** 选好了英雄：直接出现在它的区域里，然后开始下一波（开局短暂停顿后第 1 波）。 */
  choose(kind: HeroKind): void {
    this.sound('pick')
    this.heroPicker = null
    this.placeHero(kind)
    this.state = 'gap'
    this._gapLeft = this.wave === 0 ? 1 : 0.6
  }

  /** 测试用：跳过选英雄，直接放下英雄（`at`：固定站在这里、不走位，见 placeHero）。 */
  startWith(kind: HeroKind, at?: Vector2): Hero {
    if (this.heroPicker) {
      this.heroPicker.visible = false // queueFree 要到帧末才删：先藏起来，这一帧的点击不会被它的遮罩吃掉
      this.heroPicker.queueFree()
    }
    this.heroPicker = null
    this.sound('pick')
    const hero = this.placeHero(kind, at)
    this.state = 'gap'
    this._gapLeft = this.wave === 0 ? 1 : 0.6
    return hero
  }

  // ---------------------------------------------------------------- 英雄

  /**
   * 放一个英雄：近战去中上的区域，远程先上场的去左下、后上场的去右下，站在区域里的待命点
   * （近战在区域中心，远程在区域的中心偏下）。`at`（测试用）：固定站在这一点，没有区域、不走位。
   */
  placeHero(kind: HeroKind, at?: Vector2): Hero {
    if (!IMPLEMENTED.has(kind)) throw new Error(`hero ${kind} is not implemented yet`)
    if (this.heroOf(kind)) throw new Error(`hero ${kind} is already placed`)
    let zone: Zone | null = null
    if (!at) {
      zone = this.zoneFor(kind)
      at = HEROES[kind].role === 'melee' ? v((zone.left + zone.right) / 2, (zone.top + zone.bottom) / 2) : v((zone.left + zone.right) / 2, zone.top + (zone.bottom - zone.top) * 0.6)
    }
    const hero = this.add(kind === 'archer' ? new Archer(this, at) : kind === 'mage' ? new Mage(this, at) : new Knight(this, at))
    hero.zone = zone
    this.heroes.push(hero)
    hero.refreshStats() // 之前选过的通用选项（全体伤害、攻速、血量）也要算上
    hero.hp = hero.maxHp
    return hero
  }

  /** 这个英雄该站的区域：近战中上；远程左下，左下有人了就右下。 */
  zoneFor(kind: HeroKind): Zone {
    if (HEROES[kind].role === 'melee') return ZONES.melee
    const leftTaken = this.heroes.some((h) => h.zone === ZONES.rangedLeft)
    return leftTaken ? ZONES.rangedRight : ZONES.rangedLeft
  }

  heroOf(kind: HeroKind): Hero | null {
    return this.heroes.find((h) => h.kind === kind) ?? null
  }

  /** 已上场的英雄种类（三选一只出这些英雄的技能）。 */
  get placedKinds(): Set<HeroKind> {
    return new Set(this.heroes.map((h) => h.kind))
  }

  /** 离 (x, y) 最近的活着的怪物。 */
  nearestEnemy(x: number, y: number): Enemy | null {
    let best: Enemy | null = null
    let bestD = Infinity
    for (const e of this.enemies) {
      if (e.dead || e.leaked) continue
      const d = (e.x - x) ** 2 + (e.y - y) ** 2
      if (d < bestD) {
        bestD = d
        best = e
      }
    }
    return best
  }

  /** 骑士要追的怪：从区域里够得着（区域往外扩 `reach`）的地面怪里离城门最近（剩余路程最短）的。 */
  chaseTarget(zone: Zone, reach: number): Enemy | null {
    let best: Enemy | null = null
    for (const e of this.enemies) {
      if (e.dead || e.leaked || ENEMIES[e.kind].flying) continue
      if (e.x < zone.left - reach || e.x > zone.right + reach || e.y < zone.top - reach || e.y > zone.bottom + reach) continue
      if (!best || e.remaining < best.remaining) best = e
    }
    return best
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

  /** 按存档里的设置静音音乐 / 音效总线，更新 HUD 上的开关。 */
  private _applyMute() {
    const music = this.tree.storage.get('musicMuted', false)
    const sfx = this.tree.storage.get('sfxMuted', false)
    this.tree.audio.setBusMute('Music', music)
    this.tree.audio.setBusMute('SFX', sfx)
    this.hud.showMute(music, sfx)
  }

  /** 播一个音效（音量和并发上限在 sounds.ts）。 */
  sound(name: SoundName): void {
    playSound(this.tree.audio, name)
  }

  shootArrow(x: number, y: number, target: Enemy, shot: Shot, range: number): void {
    this.sound('shoot')
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
    this.sound('arrow_hit')
    if (shot.poison) this.poison(e, shot.poison.dps, shot.poison.time, shot.poison.maxStacks, 1)
    this.damage(e, shot.damage, { crit: shot.crit || shot.headshot, arrow: true, ignoreArmor: shot.headshot, source: 'archer' })
  }

  // ---------------------------------------------------------------- 法师

  castFireball(x: number, y: number, target: Enemy, blast: Blast): void {
    this.sound('fireball')
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
    const ice = b.slowPct > 0 || b.freeze
    this._burst(f.x, f.y, b.radius, ice ? 'ice' : 'fire')
    this.sound(ice ? 'freeze' : 'explode')
  }

  chainLightning(x: number, y: number, first: Enemy, damage: number, jumps: number, falloff: number): void {
    const hit = new Set<Enemy>()
    let fromX = x
    let fromY = y
    let t: Enemy | null = first
    let dmg = damage
    this.sound('lightning')
    for (let k = 0; k <= jumps && t; k++) {
      hit.add(t)
      this.add(new Bolt(fromX, fromY, t.x, t.y - 24, k % 2 === 1))
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
   * 斩击：以骑士脚底为圆心，半径内、朝目标方向的扇形里（`whirl` 时 360°）的敌人都受伤（眩晕中的乘 `stunnedMul`）；
   * 轻微击退（沿各自的路线往回推）、几率眩晕。
   */
  slash(hero: Hero, target: Enemy, s: Slash): void {
    const angle = Math.atan2(target.x - hero.x, -(target.y - hero.y)) // 0 = 正上方，和刀光贴图一致
    this.sound('slash')
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
    if (hit.length) this.sound('knockback')
    for (const e of hit) {
      // 先算伤害（打的是眩晕中的就加成），再击退、掷眩晕
      this.damage(e, s.damage * (e.stunLeft > 0 ? s.stunnedMul : 1), { source: 'knight' })
      if (e.dead || !this.controllable(e)) continue
      e.pushBack(s.knockback)
      if (s.stunChance > 0 && this.tree.rng.randf() < s.stunChance) this.stun(e, s.stunTime)
    }
    this._slashFx(hero, angle, s)
  }

  /** 刀光：120° 的弧，叠加发光、按距离缩放；360° 时三片拼成一圈。 */
  private _slashFx(hero: Hero, angle: number, s: Slash) {
    const scale = (s.range + 26) / SLASH_R
    const pieces = s.whirl ? [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3] : [0]
    for (const p of pieces) {
      const fx = this.fx.add(new Sprite2D({ texture: ASSETS.fx.get('fx_slash'), position: v(hero.x, hero.y - 30), rotation: angle + p + SLASH_TURN, scale: v(scale * 0.8, scale * 0.8), alpha: 0.85 }))
      fx.createTween().to(fx, { scale: v(scale, scale), alpha: 0 }, 0.2, Ease.QuadOut).call(() => fx.queueFree())
    }
  }

  /** 震地（重击质变）：骑士周围 `QUAKE_RADIUS` 内的敌人受伤、眩晕，一圈冲击波。 */
  quake(knight: Hero, damage: number): void {
    for (const e of this.enemies) {
      if (e.dead || (e.x - knight.x) ** 2 + (e.y - knight.y) ** 2 > QUAKE_RADIUS ** 2) continue
      this.damage(e, damage * QUAKE_MUL, { source: 'knight' })
      this.stun(e, QUAKE_STUN)
    }
    this._shockwave(knight.x, knight.y, QUAKE_RADIUS, 0xffd080)
    this.shake(FEEL.shake * 0.6, FEEL.shakeTime)
  }

  /** 从 (x, y) 扩散的一圈冲击波（柔边圆环，压扁贴在地上，叠加发光）。 */
  private _shockwave(x: number, y: number, radius: number, color: number) {
    const k = (radius * 2) / 128
    const ring = this.fx.add(new Sprite2D({ texture: ASSETS.ring, position: v(x, y), scale: v(k * 0.2, k * 0.2 * 0.5), selfModulate: color }))
    ring.createTween().to(ring, { scale: v(k, k * 0.5), alpha: 0 }, 0.45, Ease.QuadOut).call(() => ring.queueFree())
  }

  stun(e: Enemy, time: number): void {
    if (e.dead || !this.controllable(e)) return
    e.stunLeft = Math.max(e.stunLeft, time)
    this._tint(e)
  }

  /** 爆炸特效：放大淡出的爆炸（寒冰是冰晶）贴图（叠加发光）+ 火花。 */
  private _burst(x: number, y: number, radius: number, kind: 'fire' | 'ice') {
    const s = radius / (kind === 'fire' ? EXPLOSION_R : ICE_R)
    const fx = this.fx.add(new Sprite2D({ texture: ASSETS.fx.get(kind === 'fire' ? 'fx_explosion' : 'fx_ice'), position: v(x, y), scale: v(s * 0.5, s * 0.5), rotation: this.tree.rng.randfRange(-0.4, 0.4) }))
    fx.createTween().to(fx, { scale: v(s, s), alpha: 0 }, 0.35, Ease.QuadOut).call(() => fx.queueFree())
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
      this.sound('freeze')
      const ice = this.fx.add(new Sprite2D({ texture: ASSETS.fx.get('fx_ice'), position: v(e.x, e.y - 24), scale: v(0.2, 0.2) }))
      ice.createTween().to(ice, { scale: v(0.45, 0.45), alpha: 0 }, 0.4, Ease.QuadOut).call(() => ice.queueFree())
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

  /** Boss 的技能：史莱姆王召唤、骷髅巫妖复活。 */
  private _tickBosses(dt: number) {
    const now = this.tree.time
    for (let i = this.graves.length - 1; i >= 0; i--) if (now - this.graves[i]!.time > 10) this.graves.splice(i, 1)
    for (const b of [...this.enemies]) {
      const data = ENEMIES[b.kind]
      if (b.dead || (!data.summon && !data.revive)) continue
      b.abilityIn -= dt
      if (b.abilityIn > 0) continue
      if (data.summon) {
        b.abilityIn += data.summon.every
        for (let n = 0; n < data.summon.count; n++) this.spawnEnemy(data.summon.kind, this.pathFrom(b.x, b.y)).emerge(PORTAL.emerge)
        this._pulse(b, 0x80ff80, 160)
      }
      if (data.revive) {
        const r = data.revive
        b.abilityIn += r.every
        const left = r.total - b.revives
        const near = this.graves
          .filter((g) => g.kind === r.kind && now - g.time <= r.within && (g.x - b.x) ** 2 + (g.y - b.y) ** 2 <= r.radius * r.radius)
          .sort((p, q) => q.time - p.time)
          .slice(0, Math.max(0, Math.min(r.perCast, left)))
        for (const g of near) {
          this.graves.splice(this.graves.indexOf(g), 1)
          const e = this.spawnEnemy(g.kind, g.path, undefined, false, false)
          e.dist = g.dist
          e.pushBack(0)
          this._pulse(e, 0x60ff80, 60)
          b.revives++
        }
        if (near.length) this._pulse(b, 0x60ff80, r.radius)
      }
    }
  }

  /** 一圈放大淡出的光（技能提示）。 */
  private _pulse(at: Enemy, color: number, radius: number) {
    const k = (radius * 2) / 256
    const ring = this.fx.add(new Sprite2D({ texture: ASSETS.range, position: v(at.x, at.y - 30), scale: v(k * 0.3, k * 0.3), selfModulate: color }))
    ring.createTween().to(ring, { scale: v(k, k), alpha: 0 }, 0.5, Ease.QuadOut).call(() => ring.queueFree())
  }

  /** 治疗光环的计时：每 0.5 秒结算一次（开局先等 0.5 秒）。 */
  private _healTick = POISON_TICK
  /** 上一条普通怪路线预览的时间。 */
  private _lastPreview = -Infinity

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
  /**
   * 怪物的仇恨和攻击：地面怪在 `AGGRO.radius` 内看到活着的英雄就去打（最近的那个），英雄阵亡或走出 `AGGRO.leash` 就放弃、回到路线；
   * 嘲讽中的只打骑士。够得着时每隔攻击间隔打一下（停下的怪不打）。飞行的怪不理英雄。
   */
  private _tickAggro(dt: number) {
    const knight = this.heroOf('knight')
    for (const e of this.enemies) {
      if (e.dead) continue
      const data = ENEMIES[e.kind]
      if (data.flying || !data.attack) continue
      let t = e.target as Hero | null
      if (e.tauntLeft > 0 && knight && !knight.dead) t = knight
      else if (t && (t.dead || (t.x - e.x) ** 2 + (t.y - e.y) ** 2 > AGGRO.leash ** 2)) t = null
      if (!t) {
        let bestD = AGGRO.radius ** 2
        for (const h of this.heroes) {
          if (h.dead) continue
          const d = (h.x - e.x) ** 2 + (h.y - e.y) ** 2
          if (d <= bestD) {
            bestD = d
            t = h
          }
        }
      }
      if (t !== e.target) e.attackIn = Math.min(data.attack.interval * 0.5, Math.max(e.attackIn, 0))
      // 放弃目标（英雄阵亡、走远）：从当前位置接着往下走，不走回原来的路线
      if (!t && e.target && (e.ox !== 0 || e.oy !== 0)) e.repath(this.pathFrom(e.x, e.y))
      e.target = t
      if (!t || e.held || !e.inReach) continue
      e.attackIn -= dt
      if (e.attackIn > 0) continue
      e.attackIn += data.attack.interval
      e.lunge()
      this.hurtHero(t, data.attack.damage * (e.elite ? ELITE.attack : 1), e)
    }
  }

  /** 从传送门中心（随机偏一点）出发的随机路线。 */
  portalPath(): Curve2D {
    const r = this.tree.rng
    return randomPath((a, b) => r.randfRange(a, b), this.portal.x + r.randfRange(-PORTAL.jitter, PORTAL.jitter), this.portal.y + r.randfRange(-PORTAL.jitter, PORTAL.jitter) * 0.5)
  }

  /** 从 (x, y) 出发往下走的新随机路线（离开路线的怪放弃目标、在路线外死掉的怪分裂 / 被复活时用）。 */
  pathFrom(x: number, y: number): Curve2D {
    return randomPath((a, b) => this.tree.rng.randfRange(a, b), x, y)
  }

  /** 怪现在走的路线和进度；离开了路线（在打英雄）就是从它当前位置出发的新路线。 */
  private _routeOf(e: Enemy): { path: Curve2D; dist: number } {
    return e.ox === 0 && e.oy === 0 ? { path: e.path, dist: e.dist } : { path: this.pathFrom(e.x, e.y), dist: 0 }
  }

  /** 英雄挨打：扣血、飘红字、音效；打死了墓碑出现、阵亡音效（怪下一帧自己放弃它）。骑士有荆棘时反伤给 `attacker`。 */
  hurtHero(hero: Hero, amount: number, attacker?: Enemy): void {
    const dealt = hero.takeDamage(amount)
    if (dealt <= 0) return
    const thorns = hero instanceof Knight ? hero.mods.thorns : 0
    if (thorns > 0 && attacker && !attacker.dead) this.damage(attacker, dealt * thorns, { source: 'knight' })
    this._float(String(Math.round(dealt)), hero.x, hero.y - 110, 0xff5050, 0.9)
    this.sound(hero.dead ? 'hero_die' : 'hero_hit')
  }

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
    this._tickBosses(dt)
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

  /**
   * 出一只怪：默认走一条新的随机路线，出现时路线预览闪一下（普通怪限流，见 `PATH.previewGap`）。
   * `preview: false` 时不显示路线（分裂出来的小怪、复活的怪）。
   */
  spawnEnemy(kind: EnemyKind, path: Curve2D = this.portalPath(), hp?: number, elite = false, preview = true): Enemy {
    const important = elite || !!ENEMIES[kind].boss
    if (preview && (important || this.tree.time - this._lastPreview >= PATH.previewGap)) {
      this.add(new PathPreview(path, important))
      if (!important) this._lastPreview = this.tree.time
    }
    const e = this.add(new Enemy(kind, path, hp ?? enemyHp(kind, Math.max(1, this.wave), elite), LOOKS[kind], this.tree.rng.randfRange(0, Math.PI), elite))
    this.enemies.push(e)
    if (ENEMIES[kind].boss) {
      this.boss = e
      this.hud.flash(`${ENEMIES[kind].name} 出现！`, 1.6)
      this.sound('boss')
      this.shake(FEEL.shake * 1.4, FEEL.shakeTime * 1.6)
    }
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
    const dealt = Math.min(amount, e.hp)
    if (opts.source) this.chargeUlt(opts.source, dealt)
    // 斩击吸血（骑士守护分支）
    if (opts.source === 'knight' && !opts.dot) {
      const knight = this.heroOf('knight') as Knight | null
      if (knight && knight.mods.lifesteal > 0) knight.heal(dealt * knight.mods.lifesteal)
    }
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
    this.sound('die')
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
      const k = POISON_CLOUD_RADIUS / POISON_R
      const cloud = this.fx.add(new Sprite2D({ texture: ASSETS.fx.get('fx_poison'), position: v(e.x, e.y - 24), scale: v(k * 0.5, k * 0.5), alpha: 0.8 }))
      cloud.createTween().to(cloud, { scale: v(k, k), alpha: 0 }, 0.6, Ease.QuadOut).call(() => cloud.queueFree())
    }
    // 巫妖可以复活的怪：记下死在哪
    if (this.enemies.some((b) => !b.dead && ENEMIES[b.kind].revive?.kind === e.kind)) {
      const route = this._routeOf(e)
      this.graves.push({ kind: e.kind, path: route.path, dist: route.dist, x: e.x, y: e.y, time: this.tree.time })
    }
    if (e === this.boss) {
      this.boss = null
      // 打死最后一波的 Boss：胜利（不用等剩下的小怪）
      if (this.wave >= WAVE_COUNT && this.state !== 'lost') this.state = 'won'
    }
    // 分裂：在它的路线上前后错开出几只小怪（不显示路线预览；在路线外死的，路线从死的地方出发）
    const split = ENEMIES[e.kind].split
    if (split) {
      const route = this._routeOf(e)
      for (let i = 0; i < split.count; i++) {
        const child = this.spawnEnemy(split.kind, route.path, enemyHp(split.kind, Math.max(1, this.wave)), false, false)
        child.dist = Math.max(0, route.dist + (i - (split.count - 1) / 2) * 30)
        child.pushBack(0)
      }
    }
    this.gainXp(e.xp)
  }

  // ---------------------------------------------------------------- 经验和升级

  /** 加经验（乘上通用选项的经验倍率）；够了就升级（可能一次升好几级，三选一依次弹出）。 */
  gainXp(raw: number): void {
    const n = raw * this.run.xpMul
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
    this.energy[kind] = Math.min(ULT.energyMax, this.energy[kind] + (damage / ULT.damagePerEnergy) * this.run.ultChargeMul)
  }

  /** 能不能放：英雄在场上而且活着、能量满了、离上次放够 12 秒、不在升级弹窗里。 */
  canUlt(kind: HeroKind): boolean {
    const hero = this.heroOf(kind)
    return !!hero && !hero.dead && this.energy[kind] >= ULT.energyMax && this.tree.time - this.lastUlt[kind] >= ULT.minInterval && !this.picker && (this.state === 'wave' || this.state === 'gap')
  }

  private _consume(kind: HeroKind) {
    this.energy[kind] = 0
    this.lastUlt[kind] = this.tree.time
  }

  private _aimAt(kind: HeroKind, design: Vector2) {
    const at = this.tree.viewport.designToWorld(design)
    this.aimRing.showAt(at.x, at.y, kind === 'archer' ? ULT.rain.radius : ULT.meteor.radius)
  }

  /** 点了大招按钮、进入选点模式：目标圈先放在场地中间，提示怎么操作。 */
  private _aimWait(kind: HeroKind) {
    this.aimRing.showAt(375, 450, kind === 'archer' ? ULT.rain.radius : ULT.meteor.radius)
    this.hud.flash('点场上释放\n再点按钮取消', 0)
    this._aimHint = true
  }

  /** 选点模式的提示正在显示（结束时清掉；别的提示不动）。 */
  private _aimHint = false

  private _aimEnd(kind: HeroKind, design: Vector2 | null) {
    this.aimRing.visible = false
    if (this._aimHint) this.hud.flash('', 0)
    this._aimHint = false
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
    this.sound('ult_archer')
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
    this.sound('ult_mage')
    const damage = mage.stats.damage * ULT.meteor.mul
    this.add(
      new MeteorStrike(x, y, ULT.meteor.radius, (cx, cy) => {
        const r2 = ULT.meteor.radius ** 2
        for (const e of this.enemies) if (!e.dead && (e.x - cx) ** 2 + (e.y - cy) ** 2 <= r2) this.damage(e, damage)
        this._burst(cx, cy, ULT.meteor.radius, 'fire')
        this.sound('meteor')
        this.shake(FEEL.shake * 1.6, FEEL.shakeTime * 1.4)
        this.hitStop(ULT.meteor.hitStop)
      }),
    )
    return true
  }

  /**
   * 骑士战吼：半径内的地面怪受骑士伤害 × mul，能控制的被嘲讽（只打骑士）、被拉向骑士；骑士减伤一段时间、立刻回血。
   * Boss 免疫控制，只受伤害；飞行怪不受影响。
   */
  warCry(): boolean {
    const knight = this.heroOf('knight') as Knight | null
    if (!knight || !this.canUlt('knight')) return false
    this._consume('knight')
    this.sound('ult_knight')
    const w = ULT.warcry
    knight.warcry()
    for (const e of this.enemies) {
      if (e.dead || ENEMIES[e.kind].flying) continue
      const dx = knight.x - e.x
      const dy = knight.y - e.y
      const d = Math.hypot(dx, dy)
      if (d > w.radius) continue
      if (this.controllable(e)) {
        e.tauntLeft = Math.max(e.tauntLeft, w.taunt)
        // 拉近：沿着朝骑士的方向挪（只改偏移，离开路线；不拉到比够得着的距离更近）
        const pull = Math.min(w.pull, Math.max(0, d - e.reach))
        if (pull > 0) {
          e.ox += (dx / d) * pull
          e.oy += (dy / d) * pull
          e.pushBack(0)
        }
        this._tint(e)
      }
      this.damage(e, knight.stats.damage * w.mul, { source: 'knight' })
    }
    this._shockwave(knight.x, knight.y, w.radius, 0xff9040)
    this.shake(FEEL.shake, FEEL.shakeTime)
    return true
  }

  /** 打击停顿：游戏时间停一小会儿（按真实时间恢复；用 timeout.connect 不用 await，无头测试里也能恢复）。 */
  hitStop(seconds: number): void {
    this.tree.timeScale = 0
    this.tree.createTimer(seconds, { ignoreTimeScale: true }).timeout.connect(() => (this.tree.timeScale = 1), this)
  }

  /** 弹出三选一：游戏暂停，选完继续。没有可选的节点时这次升级直接跳过。 */
  openPicker(): void {
    this.ultBar.cancelAim()
    const offers = drawOffers(availableNodes(this.placedKinds, this.branchLevels), 3, () => this.tree.rng.randf())
    const level = this.level - this.pendingLevels + 1
    this.pendingLevels--
    if (!offers.length) return
    this.sound('level_up')
    this.tree.paused = true
    this.picker = this.add(new UpgradePicker(offers, level))
    this.picker.picked.connect((offer) => this.applyOffer(offer), this)
  }

  /** 选了三选一里的一个：技能节点或通用选项。 */
  applyOffer(offer: Offer): void {
    this.sound('pick')
    if (isGeneric(offer)) this.applyGeneric(offer)
    else this.applySkill(offer)
  }

  /** 通用选项：改全局倍率（所有英雄重新算数值）或回复命。 */
  applyGeneric(g: GenericOption): void {
    this.taken.push(g)
    const run = this.run
    if (g.effect === 'attackSpeed') run.attackSpeedMul += g.amount
    else if (g.effect === 'damage') run.damageMul += g.amount
    else if (g.effect === 'ultCharge') run.ultChargeMul += g.amount
    else if (g.effect === 'xp') run.xpMul += g.amount
    else if (g.effect === 'lives') this.lives += g.amount
    else if (g.effect === 'hp') run.hpMul += g.amount
    for (const h of this.heroes) h.refreshStats()
    this.picker = null
    this.tree.paused = false
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
    if (this.state === 'won' || this.state === 'lost') {
      this._updateHud() // 最后扣掉的命也显示出来
      if (!this.result) this._showResult()
      else if (this.tree.input.isActionJustPressed('confirm')) this.restart()
      return
    }
    if (this.state === 'wave' || this.state === 'gap') this.runTime += dt
    if (!this.manual) this._advanceWaves(dt)
    this._tickStatuses(dt)
    this._tickAggro(dt)
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
    // 这一帧里漏怪可能刚把状态改成失败（TypeScript 的类型收窄看不到，所以断言一下）
    const state = this.state as BattleState
    if (this.pendingLevels > 0 && !this.picker && state !== 'won' && state !== 'lost') this.openPicker()
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
        this.spawnEnemy(s.group.kind, undefined, undefined, !!s.group.elite).emerge(PORTAL.emerge)
        this._shockwave(this.portal.x, this.portal.y, 60, 0xb060ff)
        s.spawned++
        s.next += s.group.interval
      }
      if (s.spawned < s.group.count) pending = true
    }
    if (pending || this.enemies.some((e) => !e.dead)) return
    if (this.wave >= WAVE_COUNT) {
      this.state = 'won'
      return
    }
    this.state = 'gap'
    this._gapLeft = FEEL.waveGap
  }

  loseLives(n: number): void {
    if (this.state === 'lost' || this.state === 'won') return
    this.lives = Math.max(0, this.lives - n)
    this.sound('leak')
    this.shake(FEEL.shake, FEEL.shakeTime)
    if (this.lives > 0) return
    this.state = 'lost'
  }

  /** 结束：存最高波次和胜利次数，弹出结束画面（胜负、数据、构筑回顾、再来一局）。 */
  private _showResult() {
    const storage = this.tree.storage
    const won = this.state === 'won'
    const bestWave = Math.max(storage.get('bestWave', 0), this.wave)
    const wins = storage.get('wins', 0) + (won ? 1 : 0)
    storage.set('bestWave', bestWave)
    storage.set('wins', wins)
    this.ultBar.cancelAim()
    this.music.stop()
    this.sound(won ? 'win' : 'lose')
    this.result = this.add(new ResultPanel({ won, wave: this.wave, kills: this.kills, time: this.runTime, bestWave, wins, taken: this.taken }))
    this.result.restart.connect(() => this.restart(), this)
  }

  restart(): void {
    this.sound('button')
    void this.tree.changeScene(Battle)
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
    for (const k of HERO_KINDS) {
      const hero = this.heroOf(k)
      this.ultBar.buttons[k].update(!!hero, this.energy[k] / ULT.energyMax, this.canUlt(k), hero?.dead ? hero.respawnLeft : 0)
    }
    const b = this.boss
    this.hud.updateBoss(b && !b.dead ? ENEMIES[b.kind].name : null, b ? b.hp / b.maxHp : 0)
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
