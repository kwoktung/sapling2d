import type { Texture } from '../core/assets'
import { Node2D, type Node2DOptions } from '../core/Node2D'
import { Signal } from '../core/Signal'
import { identityAffine } from '../math/Affine'
import { Vector2 } from '../math/Vector2'

export interface Particles2DOptions extends Node2DOptions {
  /** 每个粒子的贴图（可以是图集里的一帧），以中心对齐。不设置就不显示（照样模拟）。 */
  texture?: Texture | null
  /** 同时存活的粒子上限，默认 16。到了上限不再发射。 */
  amount?: number
  /** 每个粒子活多久（秒），默认 1。 */
  lifetime?: number
  /** 寿命的随机程度 0–1：每个粒子的寿命在 `lifetime × (1 - 它)` 到 `lifetime` 之间。默认 0。 */
  lifetimeRandomness?: number
  /** 是否持续发射，默认 true（和 Godot 一样）。只想按需爆发时设成 false，调用 `emit()`。 */
  emitting?: boolean
  /** 一次性：`emitting` 为 true 时一下子发射 `amount` 个，然后自动把 `emitting` 设回 false。默认 false。 */
  oneShot?: boolean
  /** 持续发射时每秒发射几个，默认 `amount / lifetime`（刚好维持满员）。 */
  rate?: number | null
  /** 发射方向（弧度，0 是向右），跟着节点的全局旋转转。默认 0。 */
  direction?: number
  /** 方向的随机范围（弧度，向两边各偏这么多）。默认 π：所有方向。 */
  spread?: number
  /** 初速度（像素/秒）在这两个值之间随机。默认都是 100。 */
  speedMin?: number
  speedMax?: number
  /** 重力（像素/秒²），默认 (0, 0)。 */
  gravity?: Vector2
  /** 阻尼：每秒损失速度的比例（0 不减速，3 大约 0.3 秒就慢下来）。默认 0。 */
  damping?: number
  /** 随寿命从 start 线性变到 end 的缩放和透明度。默认 1 → 1。 */
  scaleStart?: number
  scaleEnd?: number
  alphaStart?: number
  alphaEnd?: number
  /**
   * 粒子用节点的局部坐标（跟着节点移动、旋转）。默认 false：粒子发射时取节点的全局位置，
   * 之后不随节点移动（角色跑开了，火花留在原地）。
   */
  localCoords?: boolean
}

/**
 * 精简的粒子发射器：火花、碎片、烟。粒子不是节点，数据存在发射器内部的数组里，在 `process` 阶段模拟，
 * 渲染时一个发射器一次绘制调用（Pixi 的 ParticleContainer）。
 *
 * ```ts
 * // 刀碰刀的火花：一次性爆发，结束后删掉
 * const sparks = this.add(new Particles2D({ texture: spark, position: hitPoint, emitting: false, amount: 12,
 *   lifetime: 0.35, speedMin: 200, speedMax: 450, damping: 4, scaleStart: 1, scaleEnd: 0.2, alphaEnd: 0 }))
 * sparks.emit()
 * sparks.finished.connect(() => sparks.queueFree())
 * ```
 *
 * - 随机数用 `tree.rng`（测试可复现）；时间受 `tree.timeScale` 和暂停影响（和 process 一样）。
 * - 每帧不分配内存：粒子数据在设置 `amount` 时一次分配好。
 * - 粒子没有旋转；颜色用节点的 `modulate`（含子节点）或 `selfModulate`（只有粒子）。
 */
export class Particles2D extends Node2D {
  /** 所有粒子都消失、且不再发射时触发（一次 `emit()` 或一轮 oneShot 结束）。 */
  readonly finished = new Signal()
  texture: Texture | null
  lifetime: number
  lifetimeRandomness: number
  oneShot: boolean
  rate: number | null
  direction: number
  spread: number
  speedMin: number
  speedMax: number
  gravity: Vector2
  damping: number
  scaleStart: number
  scaleEnd: number
  alphaStart: number
  alphaEnd: number
  readonly localCoords: boolean
  private _emitting: boolean
  private _amount = 0
  /** @internal 存活的粒子数；下标 0 到 _count - 1 有效（渲染层读）。 */
  _count = 0
  /** @internal 粒子数据（渲染层读）：位置（全局或局部坐标）、已经活了多久、寿命。 */
  _px = new Float64Array(0)
  _py = new Float64Array(0)
  _age = new Float64Array(0)
  _life = new Float64Array(0)
  private _vx = new Float64Array(0)
  private _vy = new Float64Array(0)
  /** 持续发射的小数部分。 */
  private _acc = 0
  /** 发射过粒子、还没有发出 finished。 */
  private _running = false
  /** @internal `_computeGlobal()` 的结果：节点的全局变换。 */
  readonly _global = identityAffine()

  constructor(options: Particles2DOptions = {}) {
    super(options)
    this.texture = options.texture ?? null
    this.lifetime = options.lifetime ?? 1
    this.lifetimeRandomness = options.lifetimeRandomness ?? 0
    this._emitting = options.emitting ?? true
    this.oneShot = options.oneShot ?? false
    this.rate = options.rate ?? null
    this.direction = options.direction ?? 0
    this.spread = options.spread ?? Math.PI
    this.speedMin = options.speedMin ?? 100
    this.speedMax = options.speedMax ?? this.speedMin
    this.gravity = options.gravity ?? Vector2.ZERO
    this.damping = options.damping ?? 0
    this.scaleStart = options.scaleStart ?? 1
    this.scaleEnd = options.scaleEnd ?? this.scaleStart
    this.alphaStart = options.alphaStart ?? 1
    this.alphaEnd = options.alphaEnd ?? this.alphaStart
    this.localCoords = options.localCoords ?? false
    this.amount = options.amount ?? 16
  }

  /** 同时存活的粒子上限。修改时清空现有的粒子。 */
  get amount(): number {
    return this._amount
  }

  set amount(value: number) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`Particles2D "${this.name}": amount must be an integer >= 0, got ${value}.`)
    this._amount = value
    this._count = 0
    this._px = new Float64Array(value)
    this._py = new Float64Array(value)
    this._vx = new Float64Array(value)
    this._vy = new Float64Array(value)
    this._age = new Float64Array(value)
    this._life = new Float64Array(value)
  }

  /** 是否持续发射（`oneShot` 时：设为 true 就爆发一轮）。 */
  get emitting(): boolean {
    return this._emitting
  }

  set emitting(value: boolean) {
    this._emitting = value
    if (value) this._acc = 0
  }

  /** 存活的粒子数。 */
  get aliveCount(): number {
    return this._count
  }

  /** 马上在当前位置发射 `count` 个粒子（默认 `amount` 个），超过上限的部分不发射。节点不在树里时不发射。 */
  emit(count: number = this._amount): void {
    if (!this.isInsideTree) return
    if (!this.localCoords) this._computeGlobal()
    for (let i = 0; i < count && this._count < this._amount; i++) this._spawn()
  }

  /** 清掉所有粒子（不发出 finished）。 */
  restart(): void {
    this._count = 0
    this._acc = 0
    this._running = false
  }

  /** @internal 模拟放在引擎内部钩子里：子类覆写 process() 不影响粒子。dt 已经乘过 timeScale，暂停时不调用。 */
  override _internalProcess(dt: number): void {
    this._simulate(dt)
    if (this._emitting) {
      if (this.oneShot) {
        this._emitting = false
        this.emit()
      } else {
        const rate = this.rate ?? (this.lifetime > 0 ? this._amount / this.lifetime : 0)
        this._acc += rate * dt
        if (this._acc >= 1) {
          if (!this.localCoords) this._computeGlobal()
          while (this._acc >= 1) {
            if (this._count < this._amount) this._spawn()
            this._acc -= 1
          }
        }
      }
    }
    if (this._running && this._count === 0 && !this._emitting) {
      this._running = false
      this.finished.emit()
    }
  }

  private _simulate(dt: number): void {
    if (this._count === 0 || dt === 0) return
    const px = this._px
    const py = this._py
    const vx = this._vx
    const vy = this._vy
    const age = this._age
    const life = this._life
    const gx = this.gravity.x * dt
    const gy = this.gravity.y * dt
    const keep = this.damping > 0 ? Math.max(0, 1 - this.damping * dt) : 1
    let n = this._count
    for (let i = 0; i < n; i++) {
      const a = age[i]! + dt
      if (a >= life[i]!) {
        // 换上最后一个粒子（还没模拟过），下标 i 再处理一次
        n--
        px[i] = px[n]!
        py[i] = py[n]!
        vx[i] = vx[n]!
        vy[i] = vy[n]!
        age[i] = age[n]!
        life[i] = life[n]!
        i--
        continue
      }
      age[i] = a
      const nvx = (vx[i]! + gx) * keep
      const nvy = (vy[i]! + gy) * keep
      vx[i] = nvx
      vy[i] = nvy
      px[i] = px[i]! + nvx * dt
      py[i] = py[i]! + nvy * dt
    }
    this._count = n
  }

  /** 在发射点生成一个粒子（全局坐标时先调用过 `_computeGlobal()`）。 */
  private _spawn(): void {
    const rng = this.tree.rng
    const i = this._count++
    let angle = this.direction + (rng.randf() * 2 - 1) * this.spread
    if (this.localCoords) {
      this._px[i] = 0
      this._py[i] = 0
    } else {
      const g = this._global
      this._px[i] = g.tx
      this._py[i] = g.ty
      angle += Math.atan2(g.b, g.a) // 方向跟着节点的全局旋转
    }
    const speed = this.speedMin + (this.speedMax - this.speedMin) * rng.randf()
    this._vx[i] = Math.cos(angle) * speed
    this._vy[i] = Math.sin(angle) * speed
    this._age[i] = 0
    this._life[i] = Math.max(1e-6, this.lifetime * (1 - this.lifetimeRandomness * rng.randf()))
    this._running = true
  }

  /**
   * @internal 算出节点的全局变换（只算到 CanvasLayer 为止，和 globalTransform 一致），写进 `_global`。不分配内存。
   * 渲染层也用它把全局坐标的粒子画回原处。
   */
  _computeGlobal(): void {
    this._computeGlobalInto(this._global)
  }

  protected override dumpProps(): Record<string, unknown> {
    return {
      ...super.dumpProps(),
      texture: this.texture?.path ?? undefined,
      emitting: this._emitting || undefined,
      particles: this._count,
    }
  }
}
