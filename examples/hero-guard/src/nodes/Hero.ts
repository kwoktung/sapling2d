import { Ease, Node2D, rect, Sprite2D, v, type Texture, type Tween, type Vector2 } from 'sapling2d'
import { ASSETS } from '../assets'
import { HEROES, RIG, type HeroKind } from '../data/heroes'
import type { Enemy } from './Enemy'

/** 英雄需要的场景接口（Battle 实现）。 */
export interface HeroWorld {
  /** 射程内离城门最近（剩余路程最短）的怪物；没有时为 null。 */
  findTarget(x: number, y: number, range: number): Enemy | null
  /** 从 (x, y) 向目标射一支箭。 */
  shootArrow(x: number, y: number, target: Enemy, damage: number): void
}

/** 英雄这一局的数值：从基础数值复制一份，技能树（05 起）改的是它。 */
export interface HeroStats {
  damage: number
  interval: number
  range: number
}

const LOOKS: Record<HeroKind, { body: Texture; weapon: Texture }> = {
  archer: { body: ASSETS.archerBody, weapon: ASSETS.archerWeapon },
  mage: { body: ASSETS.mageBody, weapon: ASSETS.mageWeapon },
  knight: { body: ASSETS.knightBody, weapon: ASSETS.knightWeapon },
}

/** 身体图 96×96，脚底在图的下边缘：身体节点往上挪半张图，英雄节点的原点就在脚底。 */
const BODY_HALF = 48

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
    super({ position, zIndex: position.y, inputPickable: true, hitArea: rect(-46, -100, 92, 108) })
    const base = HEROES[kind]
    this.stats = { damage: base.damage, interval: base.interval, range: base.range }
    this.rangeRing = this.add(new Sprite2D({ texture: ASSETS.range, visible: false, zIndex: -1, selfModulate: 0x9fe0ff }))
    this.body = this.add(new Sprite2D({ texture: LOOKS[kind].body, position: v(0, -BODY_HALF) }))
    const rig = RIG[kind]
    this.weapon = this.add(new Sprite2D({ texture: LOOKS[kind].weapon, position: v(rig.weaponX, rig.weaponY) }))
  }

  /** 显示 / 隐藏射程圈（按当前射程缩放）。 */
  showRange(show: boolean): void {
    const s = (this.stats.range * 2) / 256
    this.rangeRing.scale = v(s, s)
    this.rangeRing.visible = show
  }

  override process(dt: number) {
    this.cooldown -= dt
    if (this.dragging || this._attacking || this.cooldown > 0) return
    const target = this.world.findTarget(this.x, this.y, this.stats.range)
    if (!target) return
    this.cooldown = this.stats.interval
    this._attack(target)
  }

  /** 出手：发射箭 / 火球 / 斩击。`target` 已确认还活着、在射程内（略放宽）。 */
  protected abstract release(target: Enemy): void

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
    const aim = Math.atan2(Math.abs(target.x - this.x), -(target.y - (this.y - BODY_HALF)))
    this.weapon.rotation = Math.min(1.2, aim)
    const pose = (p: 'windup' | 'release' | 'rest') => {
      const o = this.weaponPose(p)
      return v(rig.weaponX + o.dx, rig.weaponY + o.dy)
    }
    this._anim?.kill()
    this._anim = this.createTween()
      .to(this.body, { scale: v(1.12, 0.86), y: -BODY_HALF + 6 }, windup, Ease.QuadOut)
      .parallel()
      .to(this.weapon, { position: pose('windup') }, windup, Ease.QuadOut)
      .call(() => this._release(target))
      .to(this.body, { scale: v(0.92, 1.1), y: -BODY_HALF - 4 }, recover * 0.35, Ease.QuadOut)
      .parallel()
      .to(this.weapon, { position: pose('release') }, recover * 0.35, Ease.QuadOut)
      .to(this.body, { scale: v(1, 1), y: -BODY_HALF }, recover * 0.65, Ease.BackOut)
      .parallel()
      .to(this.weapon, { position: pose('rest') }, recover * 0.65, Ease.QuadOut)
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
    this.body.scale = v(1, 1)
    this.body.y = -BODY_HALF
    this.weapon.position = v(rig.weaponX, rig.weaponY)
    this.weapon.rotation = 0
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), kind: this.kind, attacks: this.attacks }
  }
}

/** 弓手：单体追踪箭，射程最远。 */
export class Archer extends Hero {
  constructor(world: HeroWorld, position: Vector2) {
    super(world, 'archer', position)
  }

  protected override release(target: Enemy): void {
    this.world.shootArrow(this.x + this.facing * RIG.archer.weaponX, this.y + RIG.archer.weaponY, target, this.stats.damage)
  }

  protected override weaponPose(phase: 'windup' | 'release' | 'rest'): { dx: number; dy: number } {
    // 拉弓：弓往身体收、出手时往前送
    if (phase === 'windup') return { dx: -8, dy: 2 }
    if (phase === 'release') return { dx: 6, dy: -2 }
    return { dx: 0, dy: 0 }
  }
}
