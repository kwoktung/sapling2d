import type { Node } from '../core/Node'
import { Node2D, type Node2DOptions } from '../core/Node2D'
import { TILE_ONE_WAY, TILE_SOLID } from '../core/tileset'
import { Vector2 } from '../math/Vector2'
import type { RectangleShape2D } from '../physics/shapes'
import type { TileMapLayer } from './TileMapLayer'

export interface CharacterBody2DOptions extends Node2DOptions {
  /** 碰撞盒：`rectangle(w, h)`，以节点位置为中心，轴对齐，不随 rotation / scale 变化。 */
  shape: RectangleShape2D
  /** 和哪些 TileMapLayer 碰撞（位掩码，和图层的 `collisionLayer` 有交集才碰撞），默认 1。 */
  collisionMask?: number
  velocity?: Vector2
}

/** `moveAndSlide()` 撞到的一个格子。对象由角色复用：下一次 `moveAndSlide()` 后内容会变，需要保留时自己拷贝字段。 */
export interface SlideCollision {
  /** 撞到的图层。 */
  readonly tileMap: TileMapLayer
  /** 格子坐标。 */
  readonly cellX: number
  readonly cellY: number
  /** 碰撞法线（从格子指向角色）：`(0, -1)` 落地、`(0, 1)` 顶头、`(±1, 0)` 撞墙。 */
  readonly normal: Vector2
}

interface MutableSlideCollision {
  tileMap: TileMapLayer
  cellX: number
  cellY: number
  normal: Vector2
}

/** 贴边判定的容差（像素）：恰好贴着格子边缘时不算进入那一格。 */
const EPS = 1e-3
/** 每隔多少个物理帧检查一次和 StaticBody2D 的重叠（只为了给出提示）。 */
const STATIC_CHECK_INTERVAL = 30

/**
 * 由代码控制移动的角色（平台游戏的主角、敌人）：在 `physicsProcess` 里设置 `velocity`，调用 `moveAndSlide()`，
 * 角色被 TileMapLayer 的实心格挡住、能站在单向平台上，并报告是否落地、撞墙、顶头，以及撞到了哪些格子。设计见 ADR 0009。
 *
 * ```ts
 * class Player extends CharacterBody2D {
 *   constructor() { super({ shape: rectangle(12, 16) }) }
 *   override physicsProcess(dt: number) {
 *     const input = this.tree.input
 *     let vy = this.velocityY + 900 * dt                 // 重力由游戏自己加，每帧都加（站在地上也要加，才能判断落地）
 *     if (this.isOnFloor && input.isActionJustPressed('jump')) vy = -320
 *     this.setVelocity(input.isActionPressed('right') ? 90 : input.isActionPressed('left') ? -90 : 0, vy)
 *     this.moveAndSlide()
 *   }
 * }
 * ```
 *
 * - 只和 TileMapLayer 碰撞（按格子）。不创建物理刚体：`StaticBody2D` 挡不住它，`RigidBody2D` / `Area2D` 也感知不到它。
 * - 先移动 x、再移动 y，检查这一步扫过的所有格子，速度再快也不会穿墙。没有斜坡。
 * - 碰撞盒不随角色自己的 rotation / scale 变化（翻转贴图用子节点 Sprite2D 的 flipH）。角色的祖先和图层（以及图层的祖先）只能平移，旋转、缩放会报错。
 */
export class CharacterBody2D extends Node2D {
  readonly shape: RectangleShape2D
  /** 和哪些 TileMapLayer 碰撞（位掩码）。 */
  collisionMask: number
  /** 速度（像素/秒）的 x 分量。不分配内存，每帧读写时用它代替 `velocity`。 */
  velocityX: number
  /** 速度（像素/秒）的 y 分量。 */
  velocityY: number
  private _onFloor = false
  private _onWall = false
  private _onCeiling = false
  private _collisionCount = 0
  private readonly _collisions: MutableSlideCollision[] = []
  /** 这一轴最近的阻挡：距离和格子（`_sweep` 的输出）。 */
  private _hitDist = 0
  private _hitLayer: TileMapLayer | null = null
  private _hitCellX = 0
  private _hitCellY = 0
  /** `_columnBlocked` / `_rowBlocked` 找到的那一格的行 / 列。 */
  private _hitRow = 0
  private _hitCol = 0
  private _warnedStatic = false
  /** 本次 moveAndSlide 里每个图层（按 `tree._tileLayers` 的顺序）的全局平移；NaN 表示这一层不参与碰撞。复用，不分配。 */
  private readonly _layerX: number[] = []
  private readonly _layerY: number[] = []

  constructor(options: CharacterBody2DOptions) {
    super(options)
    if (options.shape?.kind !== 'rectangle') throw new Error(`CharacterBody2D "${this.name}": shape must be rectangle(w, h).`)
    this.shape = options.shape
    this.collisionMask = options.collisionMask ?? 1
    this.velocityX = options.velocity?.x ?? 0
    this.velocityY = options.velocity?.y ?? 0
  }

  /** 速度（像素/秒）。读取会创建 Vector2；每帧的计算用 `velocityX` / `velocityY` / `setVelocity`。 */
  get velocity(): Vector2 {
    return new Vector2(this.velocityX, this.velocityY)
  }

  set velocity(value: Vector2) {
    this.velocityX = value.x
    this.velocityY = value.y
  }

  setVelocity(x: number, y: number): void {
    this.velocityX = x
    this.velocityY = y
  }

  /** 上一次 `moveAndSlide()` 向下移动时被挡住（站在地面或单向平台上）。 */
  get isOnFloor(): boolean {
    return this._onFloor
  }

  /** 上一次 `moveAndSlide()` 水平移动时被挡住。 */
  get isOnWall(): boolean {
    return this._onWall
  }

  /** 上一次 `moveAndSlide()` 向上移动时被挡住（顶到了格子）。 */
  get isOnCeiling(): boolean {
    return this._onCeiling
  }

  /** 上一次 `moveAndSlide()` 撞到的格子数（0–2：x、y 方向各最多一个）。 */
  get slideCollisionCount(): number {
    return this._collisionCount
  }

  /** 上一次 `moveAndSlide()` 撞到的第 `i` 个格子（先 x 后 y）。返回的对象会被复用。 */
  getSlideCollision(i: number): SlideCollision {
    if (!(i >= 0 && i < this._collisionCount)) throw new Error(`CharacterBody2D "${this.name}": slide collision ${i} is out of range (count ${this._collisionCount}).`)
    return this._collisions[i]!
  }

  /**
   * 按 `velocity` 移动一个物理步（`tree.physicsDelta` 秒），被实心格挡住时停在格子边上、这一轴的速度清零。
   * 只能在 `physicsProcess` 里调用。
   */
  moveAndSlide(): void {
    const tree = this.tree
    if (!tree._inPhysicsProcess) {
      throw new Error(`CharacterBody2D "${this.name}": moveAndSlide() must be called from physicsProcess(), not process() or a signal handler.`)
    }
    const dt = tree.physicsDelta
    this._onFloor = false
    this._onWall = false
    this._onCeiling = false
    this._collisionCount = 0
    const hw = this.shape.width / 2
    const hh = this.shape.height / 2
    // 角色父节点的全局平移：角色的 x / y 在这个坐标系里
    const parent = this.parent
    const px = translationX(parent, this.name)
    const py = translationY(parent)
    // 参与碰撞的图层的全局平移：每次 moveAndSlide 算一次，x、y 两轴共用
    const layers = tree._tileLayers
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i]!
      const active = (layer.collisionLayer & this.collisionMask) !== 0 && layer.tileSet._hasCollision
      this._layerX[i] = active ? translationX(layer, layer.name) : NaN
      this._layerY[i] = active ? translationY(layer) : NaN
    }

    const dx = this.velocityX * dt
    if (dx !== 0) {
      const moved = this._sweep(true, dx, this.x + px, this.y + py, hw, hh)
      this.x += moved
      if (this._hitLayer) {
        this.velocityX = 0
        this._onWall = true
        this._record(dx > 0 ? Vector2.LEFT : Vector2.RIGHT)
      }
    }
    const dy = this.velocityY * dt
    if (dy !== 0) {
      const moved = this._sweep(false, dy, this.x + px, this.y + py, hw, hh)
      this.y += moved
      if (this._hitLayer) {
        this.velocityY = 0
        if (dy > 0) this._onFloor = true
        else this._onCeiling = true
        this._record(dy > 0 ? Vector2.UP : Vector2.DOWN)
      }
    }

    if (!this._warnedStatic && tree.physicsFrames % STATIC_CHECK_INTERVAL === 0) this._checkStaticOverlap(this.x + px, this.y + py, hw, hh)
  }

  /**
   * 沿一个轴扫掠：在所有碰撞的图层里找最近的阻挡格。返回实际能移动的距离；被挡住时 `_hitLayer` 等字段是那一格。
   * (cx, cy) 是角色中心的全局坐标。
   */
  private _sweep(horizontal: boolean, delta: number, cx: number, cy: number, hw: number, hh: number): number {
    this._hitLayer = null
    this._hitDist = delta
    const layers = this.tree._tileLayers
    for (let i = 0; i < layers.length; i++) {
      const ox = this._layerX[i]!
      if (Number.isNaN(ox)) continue
      const layer = layers[i]!
      // 换到图层的局部坐标（图层和它的祖先只能平移）
      const lx = cx - ox
      const ly = cy - this._layerY[i]!
      const ts = layer.tileSet.tileSize
      if (horizontal) this._sweepX(layer, delta, lx, ly, hw, hh, ts)
      else this._sweepY(layer, delta, lx, ly, hw, hh, ts)
    }
    return this._hitDist
  }

  // 下面的扫掠都只走地图范围内的格子：地图外没有碰撞，速度很大（甚至 Infinity）时也不会一格一格走下去

  private _sweepX(layer: TileMapLayer, delta: number, cx: number, cy: number, hw: number, hh: number, ts: number): void {
    const r0 = Math.max(0, Math.floor((cy - hh + EPS) / ts))
    const r1 = Math.min(layer.height - 1, Math.ceil((cy + hh - EPS) / ts) - 1)
    if (r0 > r1) return
    if (delta > 0) {
      const front = cx + hw
      const limit = front + this._hitDist // 只找比当前最近阻挡更近的格子
      // 左边缘不在角色前沿左侧的列（已经和角色重叠的列不算，避免卡在里面出不来）
      for (let c = Math.max(0, Math.ceil((front - EPS) / ts)); c < layer.width && c * ts < limit - EPS; c++) {
        if (this._columnBlocked(layer, c, r0, r1)) {
          this._hit(layer, c, this._hitRow, c * ts - front)
          return
        }
      }
    } else {
      const front = cx - hw
      const limit = front + this._hitDist
      for (let c = Math.min(layer.width - 1, Math.floor((front + EPS) / ts) - 1); c >= 0 && (c + 1) * ts > limit + EPS; c--) {
        if (this._columnBlocked(layer, c, r0, r1)) {
          this._hit(layer, c, this._hitRow, (c + 1) * ts - front)
          return
        }
      }
    }
  }

  private _sweepY(layer: TileMapLayer, delta: number, cx: number, cy: number, hw: number, hh: number, ts: number): void {
    const c0 = Math.max(0, Math.floor((cx - hw + EPS) / ts))
    const c1 = Math.min(layer.width - 1, Math.ceil((cx + hw - EPS) / ts) - 1)
    if (c0 > c1) return
    if (delta > 0) {
      const front = cy + hh
      const limit = front + this._hitDist
      // 这些行的顶面都不高于移动前的脚底，所以单向平台在这里一律算实心
      for (let r = Math.max(0, Math.ceil((front - EPS) / ts)); r < layer.height && r * ts < limit - EPS; r++) {
        if (this._rowBlocked(layer, r, c0, c1, true)) {
          this._hit(layer, this._hitCol, r, r * ts - front)
          return
        }
      }
    } else {
      const front = cy - hh
      const limit = front + this._hitDist
      for (let r = Math.min(layer.height - 1, Math.floor((front + EPS) / ts) - 1); r >= 0 && (r + 1) * ts > limit + EPS; r--) {
        if (this._rowBlocked(layer, r, c0, c1, false)) {
          this._hit(layer, this._hitCol, r, (r + 1) * ts - front)
          return
        }
      }
    }
  }

  /** 第 c 列在 r0..r1 行里有没有实心格（单向平台不挡水平移动）。 */
  private _columnBlocked(layer: TileMapLayer, c: number, r0: number, r1: number): boolean {
    for (let r = r0; r <= r1; r++) {
      if (layer._cellCollision(c, r) === TILE_SOLID) {
        this._hitRow = r
        return true
      }
    }
    return false
  }

  /** 第 r 行在 c0..c1 列里有没有挡路的格子。 */
  private _rowBlocked(layer: TileMapLayer, r: number, c0: number, c1: number, falling: boolean): boolean {
    for (let c = c0; c <= c1; c++) {
      const k = layer._cellCollision(c, r)
      if (k === TILE_SOLID || (falling && k === TILE_ONE_WAY)) {
        this._hitCol = c
        return true
      }
    }
    return false
  }

  private _hit(layer: TileMapLayer, cellX: number, cellY: number, dist: number): void {
    this._hitLayer = layer
    this._hitCellX = cellX
    this._hitCellY = cellY
    this._hitDist = dist
  }

  private _record(normal: Vector2): void {
    let c = this._collisions[this._collisionCount]
    if (!c) {
      c = { tileMap: this._hitLayer!, cellX: 0, cellY: 0, normal }
      this._collisions.push(c)
    }
    c.tileMap = this._hitLayer!
    c.cellX = this._hitCellX
    c.cellY = this._hitCellY
    c.normal = normal
    this._collisionCount++
  }

  /** StaticBody2D 挡不住角色：重叠时提示一次（只在物理世界已经存在时检查，并限制频率）。 */
  private _checkStaticOverlap(cx: number, cy: number, hw: number, hh: number): void {
    const world = this.tree._physicsIfCreated
    if (!world) return
    const body = world._firstStaticOverlapping(cx - hw, cy - hh, cx + hw, cy + hh) as unknown as Node | null
    if (!body) return
    this._warnedStatic = true
    console.warn(
      `CharacterBody2D "${this.name}" overlaps StaticBody2D "${body.name}", which does not block it: CharacterBody2D only collides with TileMapLayer cells. Put walls and floors in a TileMapLayer.`,
    )
  }

  protected override dumpProps(): Record<string, unknown> {
    return {
      ...super.dumpProps(),
      velocity: this.velocityX !== 0 || this.velocityY !== 0 ? this.velocity : undefined,
      onFloor: this._onFloor || undefined,
      onWall: this._onWall || undefined,
      onCeiling: this._onCeiling || undefined,
    }
  }
}

/** 节点（含）及其 Node2D 祖先的全局平移 x。遇到旋转或缩放时报错：格子碰撞只支持平移。 */
function translationX(node: Node | null, name: string): number {
  let x = 0
  for (let n = node; n; n = n.parent) {
    if (!(n instanceof Node2D)) continue
    if (n.rotation !== 0 || n.scale.x !== 1 || n.scale.y !== 1) {
      throw new Error(`CharacterBody2D / TileMapLayer "${name}": "${n.name}" is rotated or scaled; tile collision only supports translation.`)
    }
    x += n.x
  }
  return x
}

/** 同 translationX 的 y（旋转、缩放已经在 translationX 里检查过）。 */
function translationY(node: Node | null): number {
  let y = 0
  for (let n = node; n; n = n.parent) if (n instanceof Node2D) y += n.y
  return y
}
