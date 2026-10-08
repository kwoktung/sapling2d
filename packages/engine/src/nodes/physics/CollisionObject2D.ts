import { Node2D, type Node2DOptions } from '../../core/Node2D'
import { Signal } from '../../core/Signal'
import type { Vector2 } from '../../math/Vector2'
import type { BodyHandle, BodyProps, BodyType, CollisionObjectNode, ShapePlacement } from '../../physics/PhysicsWorld'
import { CollisionShape2D } from './CollisionShape2D'
import type { PhysicsBody2D } from './PhysicsBody2D'

export interface CollisionObject2DOptions extends Node2DOptions {
  /** 自己所在的碰撞层（位掩码），默认 1（第 1 层）。共 32 层。 */
  collisionLayer?: number
  /** 自己检测的碰撞层（位掩码），默认 1。 */
  collisionMask?: number
}

/**
 * 碰撞对象的基类（对应 Godot 的 CollisionObject2D）：RigidBody2D、StaticBody2D、Area2D。
 * 碰撞形状由 CollisionShape2D 子节点提供。
 *
 * 碰撞层规则与 Godot 相同：A 和 B 发生碰撞（或检测到对方），当且仅当
 * `A.collisionMask & B.collisionLayer` 或 `B.collisionMask & A.collisionLayer` 不为 0。
 */
export abstract class CollisionObject2D extends Node2D implements CollisionObjectNode {
  abstract readonly _bodyType: BodyType
  abstract readonly _isArea: boolean
  private _collisionLayer: number
  private _collisionMask: number
  private _bodyEntered: Signal<[body: PhysicsBody2D]> | null = null
  private _bodyExited: Signal<[body: PhysicsBody2D]> | null = null
  /** @internal */
  protected _handle: BodyHandle | null = null

  constructor(options: CollisionObject2DOptions = {}) {
    super(options)
    this._collisionLayer = (options.collisionLayer ?? 1) >>> 0
    this._collisionMask = (options.collisionMask ?? 1) >>> 0
  }

  // ---------------------------------------------------------------- 碰撞层

  get collisionLayer(): number {
    return this._collisionLayer
  }

  set collisionLayer(value: number) {
    this._collisionLayer = value >>> 0
    this._propsChanged()
  }

  get collisionMask(): number {
    return this._collisionMask
  }

  set collisionMask(value: number) {
    this._collisionMask = value >>> 0
    this._propsChanged()
  }

  /** 第 `layer` 层（1–32）是否在 collisionLayer 中。 */
  getCollisionLayerValue(layer: number): boolean {
    return (this._collisionLayer & bit(layer)) !== 0
  }

  setCollisionLayerValue(layer: number, value: boolean): void {
    this.collisionLayer = value ? this._collisionLayer | bit(layer) : this._collisionLayer & ~bit(layer)
  }

  /** 第 `layer` 层（1–32）是否在 collisionMask 中。 */
  getCollisionMaskValue(layer: number): boolean {
    return (this._collisionMask & bit(layer)) !== 0
  }

  setCollisionMaskValue(layer: number, value: boolean): void {
    this.collisionMask = value ? this._collisionMask | bit(layer) : this._collisionMask & ~bit(layer)
  }

  // ---------------------------------------------------------------- 信号

  /**
   * 一个刚体开始接触（Area2D：进入区域）。在物理步结束后触发，此时可以安全地增删节点。
   * 参数可能是刚被销毁的节点（检查 `isFreed`）。
   */
  get bodyEntered(): Signal<[body: PhysicsBody2D]> {
    return (this._bodyEntered ??= new Signal())
  }

  /** 一个刚体结束接触（Area2D：离开区域）。对方被销毁或移出树时也会触发。 */
  get bodyExited(): Signal<[body: PhysicsBody2D]> {
    return (this._bodyExited ??= new Signal())
  }

  // ---------------------------------------------------------------- 生命周期（内部）

  /** @internal */
  override _onEnterTree(): void {
    this.tree.physics._register(this)
  }

  /** @internal */
  override _onExitTree(): void {
    this.tree.physics._unregister(this)
  }

  /** @internal */
  override _onFreed(): void {
    super._onFreed()
    this._bodyEntered?.disconnectAll()
    this._bodyExited?.disconnectAll()
  }

  // ---------------------------------------------------------------- CollisionObjectNode（内部）

  /** @internal */
  _shapes(): ShapePlacement[] {
    const out: ShapePlacement[] = []
    for (const c of this.children) {
      if (c instanceof CollisionShape2D && c.shape && !c.disabled && c.isInsideTree) {
        out.push({ shape: c.shape, position: c.position, rotation: c.rotation })
      }
    }
    return out
  }

  /** @internal */
  _props(): BodyProps {
    return {
      friction: 0.5,
      bounce: 0,
      mass: 1,
      gravityScale: 1,
      linearDamp: 0,
      angularDamp: 0,
      lockRotation: false,
      canSleep: true,
      ccd: false,
    }
  }

  /** @internal */
  _writeBack(_globalPosition: Vector2, _globalRotation: number): void {}

  /** @internal */
  _attached(handle: BodyHandle): void {
    this._handle = handle
  }

  /** @internal */
  _detached(): void {
    this._handle = null
  }

  /** @internal 由物理世界在物理步结束后调用。 */
  _emitBodyEntered(body: PhysicsBody2D): void {
    this._bodyEntered?.emit(body)
  }

  /** @internal */
  _emitBodyExited(body: PhysicsBody2D): void {
    this._bodyExited?.emit(body)
  }

  /** @internal */
  _shapesChanged(): void {
    if (this.isInsideTree) this.tree.physics._shapesChanged(this)
  }

  /** @internal */
  protected _propsChanged(): void {
    if (this.isInsideTree) this.tree.physics._propsChanged(this)
  }

  protected override dumpProps(): Record<string, unknown> {
    return {
      ...super.dumpProps(),
      collisionLayer: this._collisionLayer !== 1 ? this._collisionLayer : undefined,
      collisionMask: this._collisionMask !== 1 ? this._collisionMask : undefined,
    }
  }
}

function bit(layer: number): number {
  if (!Number.isInteger(layer) || layer < 1 || layer > 32) throw new Error(`Collision layer must be an integer in 1..32, got ${layer}`)
  return (1 << (layer - 1)) >>> 0
}
