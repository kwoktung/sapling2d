import { Vector2 } from '../../math/Vector2'
import type { BodyHandle, BodyProps } from '../../physics/PhysicsWorld'
import { PhysicsBody2D, type PhysicsBody2DOptions } from './PhysicsBody2D'

export interface RigidBody2DOptions extends PhysicsBody2DOptions {
  /** 质量（kg），默认 1。 */
  mass?: number
  /** 重力倍数，默认 1；0 表示不受重力。 */
  gravityScale?: number
  /** 线速度阻尼，默认 0。 */
  linearDamp?: number
  /** 角速度阻尼，默认 0。 */
  angularDamp?: number
  /** 锁定旋转（不会因碰撞而转动）。 */
  lockRotation?: boolean
  /** 静止一段时间后允许休眠以节省性能，默认 true。 */
  canSleep?: boolean
  /** 连续碰撞检测，防止高速物体穿过薄墙。比较耗性能，只给快速移动的物体开。 */
  ccd?: boolean
  /** 初始线速度（px/s）。 */
  linearVelocity?: Vector2
  /** 初始角速度（弧度/秒）。 */
  angularVelocity?: number
}

/**
 * 受物理模拟驱动的刚体：受重力、碰撞、冲量和力的作用。
 *
 * ```ts
 * const ball = this.add(new RigidBody2D({ position: v(375, 100), bounce: 0.3 }))
 * ball.add(new CollisionShape2D({ shape: circle(30) }))
 * ball.add(new Sprite2D({ texture: Main.assets.ball }))
 * ball.applyCentralImpulse(v(200, 0))
 * ```
 *
 * position 和 rotation 由物理世界每步写回。直接给它们赋值等于瞬移：刚体被放到新位置，速度清零。
 * 刚体在加入树之后的第一个物理步才真正创建；在那之前设置的速度和冲量会排队，创建时生效。
 */
export class RigidBody2D extends PhysicsBody2D {
  readonly _bodyType = 'dynamic' as const
  private _mass: number
  private _gravityScale: number
  private _linearDamp: number
  private _angularDamp: number
  private _lockRotation: boolean
  private _canSleep: boolean
  private _ccd: boolean
  private _pendingLinearVelocity: Vector2 | null
  private _pendingAngularVelocity: number | null
  private _pending: ((h: BodyHandle) => void)[] = []

  constructor(options: RigidBody2DOptions = {}) {
    super(options)
    this._mass = options.mass ?? 1
    this._gravityScale = options.gravityScale ?? 1
    this._linearDamp = options.linearDamp ?? 0
    this._angularDamp = options.angularDamp ?? 0
    this._lockRotation = options.lockRotation ?? false
    this._canSleep = options.canSleep ?? true
    this._ccd = options.ccd ?? false
    this._pendingLinearVelocity = options.linearVelocity ?? null
    this._pendingAngularVelocity = options.angularVelocity ?? null
  }

  // ---------------------------------------------------------------- 属性

  get mass(): number {
    return this._mass
  }

  set mass(value: number) {
    if (!(value > 0)) throw new Error(`RigidBody2D mass must be > 0, got ${value}`)
    this._mass = value
    this._propsChanged()
  }

  get gravityScale(): number {
    return this._gravityScale
  }

  set gravityScale(value: number) {
    this._gravityScale = value
    this._propsChanged()
  }

  get linearDamp(): number {
    return this._linearDamp
  }

  set linearDamp(value: number) {
    this._linearDamp = value
    this._propsChanged()
  }

  get angularDamp(): number {
    return this._angularDamp
  }

  set angularDamp(value: number) {
    this._angularDamp = value
    this._propsChanged()
  }

  get lockRotation(): boolean {
    return this._lockRotation
  }

  set lockRotation(value: boolean) {
    this._lockRotation = value
    this._propsChanged()
  }

  get canSleep(): boolean {
    return this._canSleep
  }

  set canSleep(value: boolean) {
    this._canSleep = value
    this._propsChanged()
  }

  get ccd(): boolean {
    return this._ccd
  }

  set ccd(value: boolean) {
    this._ccd = value
    this._propsChanged()
  }

  /** 线速度（px/s）。 */
  get linearVelocity(): Vector2 {
    return this._handle?.linearVelocity ?? this._pendingLinearVelocity ?? Vector2.ZERO
  }

  set linearVelocity(value: Vector2) {
    if (this._handle) this._handle.linearVelocity = value
    else this._pendingLinearVelocity = value
  }

  /** 角速度（弧度/秒）。 */
  get angularVelocity(): number {
    return this._handle?.angularVelocity ?? this._pendingAngularVelocity ?? 0
  }

  set angularVelocity(value: number) {
    if (this._handle) this._handle.angularVelocity = value
    else this._pendingAngularVelocity = value
  }

  /** 是否处于休眠。设为 false 可以唤醒。 */
  get sleeping(): boolean {
    return this._handle?.sleeping ?? false
  }

  set sleeping(value: boolean) {
    this._withHandle((h) => (h.sleeping = value))
  }

  // ---------------------------------------------------------------- 冲量与力

  /** 在质心施加冲量（kg·px/s）：立即改变速度。 */
  applyCentralImpulse(impulse: Vector2): void {
    this._withHandle((h) => h.applyImpulse(impulse))
  }

  /** 在相对质心偏移 `offset`（像素，全局方向）处施加冲量，会同时产生转动。 */
  applyImpulse(impulse: Vector2, offset: Vector2): void {
    this._withHandle((h) => h.applyImpulse(impulse, offset))
  }

  /** 在质心施加力（kg·px/s²），只作用于下一个物理步；要持续施力请在每次 physicsProcess 中调用。 */
  applyCentralForce(force: Vector2): void {
    this._withHandle((h) => h.applyForce(force))
  }

  /** 在相对质心偏移处施加力，只作用于下一个物理步。 */
  applyForce(force: Vector2, offset: Vector2): void {
    this._withHandle((h) => h.applyForce(force, offset))
  }

  /** 施加角冲量（kg·px²/s）。 */
  applyTorqueImpulse(impulse: number): void {
    this._withHandle((h) => h.applyTorqueImpulse(impulse))
  }

  /** 施加力矩（kg·px²/s²），只作用于下一个物理步。 */
  applyTorque(torque: number): void {
    this._withHandle((h) => h.applyTorque(torque))
  }

  private _withHandle(fn: (h: BodyHandle) => void): void {
    if (this._handle) fn(this._handle)
    else this._pending.push(fn)
  }

  // ---------------------------------------------------------------- 内部

  /** @internal */
  override _props(): BodyProps {
    return {
      ...super._props(),
      mass: this._mass,
      gravityScale: this._gravityScale,
      linearDamp: this._linearDamp,
      angularDamp: this._angularDamp,
      lockRotation: this._lockRotation,
      canSleep: this._canSleep,
      ccd: this._ccd,
    }
  }

  /** @internal 刚体创建：应用排队的速度和冲量。 */
  override _attached(handle: BodyHandle): void {
    super._attached(handle)
    if (this._pendingLinearVelocity) handle.linearVelocity = this._pendingLinearVelocity
    if (this._pendingAngularVelocity !== null) handle.angularVelocity = this._pendingAngularVelocity
    this._pendingLinearVelocity = null
    this._pendingAngularVelocity = null
    const pending = this._pending
    this._pending = []
    for (const fn of pending) fn(handle)
  }

  /** @internal 离开树时记住速度，重新加入后继续。 */
  override _detached(): void {
    if (this._handle) {
      this._pendingLinearVelocity = this._handle.linearVelocity
      this._pendingAngularVelocity = this._handle.angularVelocity
    }
    super._detached()
  }

  protected override dumpProps(): Record<string, unknown> {
    const v = this.linearVelocity
    const sleeping = this.sleeping
    return {
      ...super.dumpProps(),
      mass: this._mass !== 1 ? this._mass : undefined,
      linearVelocity: !sleeping && v.lengthSquared() > 1e-4 ? v : undefined,
      sleeping: sleeping || undefined,
    }
  }
}
