import { BoxShape, CircleShape, PolygonShape, World, type Body, type Contact, type Fixture } from 'planck'
import { Vector2 } from '../math/Vector2'
import type { Shape2D } from './shapes'

/**
 * 物理世界：引擎里唯一直接使用 planck 的地方（见 ADR 0005）。每个 SceneTree 一个，通过 `tree.physics` 访问。
 *
 * 对外一律用像素和 px/s²，内部按 `pixelsPerMeter` 换算成米（Box2D 在 0.1–10 米的物体上最稳定）。
 * 每个物理步：
 * 1. 同步节点上的变化（新建刚体、改形状、改属性、瞬移、区域跟随）
 * 2. `world.step`（此时世界锁定；接触事件只入队）
 * 3. 把刚体状态写回节点
 * 4. 派发接触信号（bodyEntered / bodyExited）——此时可以安全地增删节点
 */

export interface PhysicsSettings {
  /** 像素与米的换算比例，默认 50。物体尺寸在 5–500 像素之间时最稳定。 */
  pixelsPerMeter?: number
  /** 重力（px/s²），默认 (0, 980)，y 轴向下。 */
  gravity?: Vector2
  /** 速度迭代次数，默认 8。没有 JIT 的设备上可以调低以换取性能。 */
  velocityIterations?: number
  /** 位置迭代次数，默认 3。 */
  positionIterations?: number
}

export type BodyType = 'static' | 'dynamic' | 'kinematic'

/** 碰撞形状在刚体局部坐标中的摆放（像素）。 */
export interface ShapePlacement {
  shape: Shape2D
  position: Vector2
  rotation: number
}

/** 刚体的材质和运动参数。 */
export interface BodyProps {
  friction: number
  bounce: number
  /** 总质量（kg）；只对 dynamic 有意义。 */
  mass: number
  gravityScale: number
  linearDamp: number
  angularDamp: number
  lockRotation: boolean
  canSleep: boolean
  /** 连续碰撞检测（Box2D 的 bullet），防止高速物体穿透。 */
  ccd: boolean
}

/** 碰撞对象（CollisionObject2D）对物理世界暴露的内部接口。 */
export interface CollisionObjectNode {
  readonly _bodyType: BodyType
  /** 区域：传感器，不参与碰撞解算，不写回位置，跟随节点的全局变换。 */
  readonly _isArea: boolean
  readonly collisionLayer: number
  readonly collisionMask: number
  readonly globalPosition: Vector2
  readonly globalRotation: number
  readonly isFreed: boolean
  _shapes(): ShapePlacement[]
  _props(): BodyProps
  /** 物理步之后写回全局位置和角度。 */
  _writeBack(globalPosition: Vector2, globalRotation: number): void
  /** 刚体建好后回调，节点据此应用排队的速度等。 */
  _attached(handle: BodyHandle): void
  _detached(): void
  _emitBodyEntered(body: never): void
  _emitBodyExited(body: never): void
}

interface Entry {
  node: CollisionObjectNode
  body: Body | null
  shapesDirty: boolean
  propsDirty: boolean
  teleport: boolean
  /** 区域上次同步时的全局位置和角度，用于发现“祖先移动了”。 */
  lastX: number
  lastY: number
  lastAngle: number
}

type ContactEvent = { begin: boolean; a: CollisionObjectNode; b: CollisionObjectNode }

export class PhysicsWorld {
  readonly pixelsPerMeter: number
  readonly velocityIterations: number
  readonly positionIterations: number
  private readonly _world: World
  /** 按加入顺序保存：顺序影响求解顺序，保持确定性。 */
  private readonly _entries = new Map<CollisionObjectNode, Entry>()
  private _gravity: Vector2
  /** world.step 期间收集的接触事件，步后统一派发。 */
  private _events: ContactEvent[] = []
  /** 每对对象之间的接触 fixture 数：从 0 变 1 时 entered，从 1 变 0 时 exited。 */
  private _pairs = new Map<CollisionObjectNode, Map<CollisionObjectNode, number>>()

  constructor(settings: PhysicsSettings = {}) {
    this.pixelsPerMeter = settings.pixelsPerMeter ?? 50
    this.velocityIterations = settings.velocityIterations ?? 8
    this.positionIterations = settings.positionIterations ?? 3
    this._gravity = settings.gravity ?? new Vector2(0, 980)
    this._world = new World({ gravity: this._toMeters(this._gravity) })
    this._world.on('begin-contact', (c) => this._onContact(c, true))
    this._world.on('end-contact', (c) => this._onContact(c, false))
  }

  /** 重力（px/s²）。 */
  get gravity(): Vector2 {
    return this._gravity
  }

  set gravity(value: Vector2) {
    this._gravity = value
    this._world.setGravity(this._toMeters(value))
  }

  /** 当前物理世界里的碰撞对象数量（含区域）。 */
  get bodyCount(): number {
    return this._entries.size
  }

  // ---------------------------------------------------------------- 由节点调用

  /** @internal 节点进入树。刚体在下一个物理步开始时创建。 */
  _register(node: CollisionObjectNode): void {
    if (this._entries.has(node)) return
    this._entries.set(node, { node, body: null, shapesDirty: true, propsDirty: true, teleport: false, lastX: NaN, lastY: NaN, lastAngle: NaN })
  }

  /** @internal 节点离开树：销毁刚体。接触中的对象会在下一个物理步之后收到 bodyExited。 */
  _unregister(node: CollisionObjectNode): void {
    const e = this._entries.get(node)
    if (!e) return
    this._entries.delete(node)
    if (e.body) this._world.destroyBody(e.body) // 会为每个接触触发 end-contact，入队
    node._detached()
  }

  /** @internal 碰撞形状增删或变化。 */
  _shapesChanged(node: CollisionObjectNode): void {
    const e = this._entries.get(node)
    if (e) e.shapesDirty = true
  }

  /** @internal 材质、质量、碰撞层等属性变化。 */
  _propsChanged(node: CollisionObjectNode): void {
    const e = this._entries.get(node)
    if (e) e.propsDirty = true
  }

  /**
   * @internal 用户直接设置了节点的位置或角度。立即瞬移（清零速度），这样紧接着设置的速度或冲量不会被清掉。
   * 游戏代码运行时世界不会锁定（physicsProcess 在 step 之前、接触信号在 step 之后），万一锁定则推迟到下一步。
   */
  _teleport(node: CollisionObjectNode): void {
    const e = this._entries.get(node)
    if (!e || !e.body || node._isArea) return
    if (this._world.isLocked()) e.teleport = true
    else this._applyTeleport(e.body, node)
  }

  private _applyTeleport(body: Body, node: CollisionObjectNode): void {
    body.setTransform(this._toMeters(node.globalPosition), node.globalRotation)
    if (node._bodyType === 'dynamic') {
      body.setLinearVelocity({ x: 0, y: 0 })
      body.setAngularVelocity(0)
    }
    body.setAwake(true)
    // Box2D 不会因为 setTransform 唤醒接触中的刚体（比如静态地面被移开时，上面休眠的球会悬空）
    for (let c = body.getContactList(); c; c = c.next ?? null) c.other?.setAwake(true)
  }

  /** @internal 当前与 node 接触 / 重叠的对象（按开始接触的顺序），不含区域。 */
  _overlaps(node: CollisionObjectNode): CollisionObjectNode[] {
    return [...(this._pairs.get(node)?.keys() ?? [])].filter((n) => !n._isArea)
  }

  // ---------------------------------------------------------------- 由 SceneTree 调用

  /** @internal 推进一个物理步（dt 单位秒）。 */
  _step(dt: number): void {
    for (const e of this._entries.values()) this._sync(e)
    this._world.step(dt, this.velocityIterations, this.positionIterations)
    const ppm = this.pixelsPerMeter
    for (const e of this._entries.values()) {
      const b = e.body
      if (!b || e.node._isArea || e.node._bodyType === 'static' || !b.isAwake()) continue
      const p = b.getPosition()
      e.node._writeBack(new Vector2(p.x * ppm, p.y * ppm), b.getAngle())
    }
    this._dispatchContacts()
  }

  // ---------------------------------------------------------------- 接触

  private _onContact(contact: Contact, begin: boolean): void {
    const a = contact.getFixtureA().getBody().getUserData() as CollisionObjectNode | null
    const b = contact.getFixtureB().getBody().getUserData() as CollisionObjectNode | null
    if (a && b && a !== b) this._events.push({ begin, a, b })
  }

  private _dispatchContacts(): void {
    // 回调里可能再触发接触事件（比如 remove 一个刚体），循环到队列清空
    while (this._events.length > 0) {
      const events = this._events
      this._events = []
      for (const { begin, a, b } of events) {
        const before = this._pairCount(a, b)
        this._setPairCount(a, b, Math.max(0, before + (begin ? 1 : -1)))
        if (begin && before === 0) this._emit(a, b, true)
        else if (!begin && before === 1) this._emit(a, b, false)
      }
    }
  }

  private _emit(a: CollisionObjectNode, b: CollisionObjectNode, entered: boolean): void {
    const notify = (self: CollisionObjectNode, other: CollisionObjectNode) => {
      if (other._isArea || self.isFreed) return // 只上报刚体；区域不出现在别人的信号里
      if (entered) self._emitBodyEntered(other as never)
      else self._emitBodyExited(other as never)
    }
    notify(a, b)
    notify(b, a)
  }

  private _pairCount(a: CollisionObjectNode, b: CollisionObjectNode): number {
    return this._pairs.get(a)?.get(b) ?? 0
  }

  private _setPairCount(a: CollisionObjectNode, b: CollisionObjectNode, n: number): void {
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      let m = this._pairs.get(x)
      if (n > 0) {
        if (!m) this._pairs.set(x, (m = new Map()))
        m.set(y, n)
      } else if (m) {
        m.delete(y)
        if (m.size === 0) this._pairs.delete(x)
      }
    }
  }

  // ---------------------------------------------------------------- 同步

  private _sync(e: Entry): void {
    const node = e.node
    let created = false
    if (!e.body) {
      e.body = this._world.createBody({
        type: node._bodyType,
        position: this._toMeters(node.globalPosition),
        angle: node.globalRotation,
      })
      e.body.setUserData(node)
      e.shapesDirty = true
      e.propsDirty = true
      created = true
    }
    const body = e.body
    if (e.shapesDirty || e.propsDirty) {
      const props = node._props()
      if (e.shapesDirty) this._rebuildFixtures(body, node, props)
      else this._applyFixtureProps(body, props)
      this._applyBodyProps(body, props)
      e.shapesDirty = false
      e.propsDirty = false
    }
    if (node._isArea) {
      // 区域跟随节点的全局变换（包括祖先的移动）
      const p = node.globalPosition
      const angle = node.globalRotation
      if (p.x !== e.lastX || p.y !== e.lastY || angle !== e.lastAngle) {
        body.setTransform(this._toMeters(p), angle)
        body.setAwake(true)
        e.lastX = p.x
        e.lastY = p.y
        e.lastAngle = angle
      }
      e.teleport = false
    } else if (e.teleport) {
      e.teleport = false
      this._applyTeleport(body, node)
    }
    // 形状和质量都就绪后再交给节点：此时应用排队的冲量才会用到正确的质量
    if (created) node._attached(new BodyHandle(body, this.pixelsPerMeter))
  }

  private _rebuildFixtures(body: Body, node: CollisionObjectNode, props: BodyProps): void {
    for (let f: Fixture | null = body.getFixtureList(); f; ) {
      const next = f.getNext()
      body.destroyFixture(f)
      f = next
    }
    const shapes = node._shapes()
    const ppm = this.pixelsPerMeter
    const totalArea = shapes.reduce((sum, s) => sum + s.shape.area, 0) / (ppm * ppm)
    // 密度 = 质量 / 面积，使刚体总质量等于 mass
    const density = totalArea > 0 ? props.mass / totalArea : 1
    for (const placement of shapes) {
      const fixture = body.createFixture({
        shape: this._planckShape(placement),
        density,
        friction: props.friction,
        restitution: props.bounce,
        isSensor: node._isArea,
      })
      fixture.setUserData(node)
      // 碰撞层用 Godot 的规则（任一方的 mask 包含对方的 layer），而不是 Box2D 的“双方都要匹配”
      fixture.shouldCollide = (that: Fixture) => {
        const other = that.getUserData() as CollisionObjectNode | null
        if (!other) return true
        return (node.collisionMask & other.collisionLayer) !== 0 || (other.collisionMask & node.collisionLayer) !== 0
      }
    }
    body.resetMassData()
  }

  private _planckShape({ shape, position, rotation }: ShapePlacement) {
    const ppm = this.pixelsPerMeter
    const center = this._toMeters(position)
    if (shape.kind === 'circle') return new CircleShape(center, shape.radius / ppm)
    if (shape.kind === 'rectangle') return new BoxShape(shape.width / 2 / ppm, shape.height / 2 / ppm, center, rotation)
    return new PolygonShape(shape.points.map((p) => this._toMeters(p.rotated(rotation).add(position))))
  }

  private _applyFixtureProps(body: Body, props: BodyProps): void {
    let count = 0
    for (let f: Fixture | null = body.getFixtureList(); f; f = f.getNext()) {
      f.setFriction(props.friction)
      f.setRestitution(props.bounce)
      f.refilter() // 碰撞层可能变了
      count++
    }
    if (count === 0 || body.isStatic()) return
    // 质量变化时按比例调整密度
    const currentMass = body.getMass()
    if (currentMass > 0 && Math.abs(currentMass - props.mass) > 1e-9) {
      const k = props.mass / currentMass
      for (let f: Fixture | null = body.getFixtureList(); f; f = f.getNext()) f.setDensity(f.getDensity() * k)
      body.resetMassData()
    }
  }

  private _applyBodyProps(body: Body, props: BodyProps): void {
    body.setGravityScale(props.gravityScale)
    body.setLinearDamping(props.linearDamp)
    body.setAngularDamping(props.angularDamp)
    body.setFixedRotation(props.lockRotation)
    body.setSleepingAllowed(props.canSleep)
    body.setBullet(props.ccd)
  }

  private _toMeters(p: { x: number; y: number }): { x: number; y: number } {
    return { x: p.x / this.pixelsPerMeter, y: p.y / this.pixelsPerMeter }
  }
}

/** 节点持有的刚体句柄：把像素单位的读写换算成 planck 的米。 */
export class BodyHandle {
  private readonly _body: Body
  private readonly _ppm: number

  constructor(body: Body, pixelsPerMeter: number) {
    this._body = body
    this._ppm = pixelsPerMeter
  }

  /** 线速度（px/s）。 */
  get linearVelocity(): Vector2 {
    const v = this._body.getLinearVelocity()
    return new Vector2(v.x * this._ppm, v.y * this._ppm)
  }

  set linearVelocity(value: Vector2) {
    this._body.setLinearVelocity({ x: value.x / this._ppm, y: value.y / this._ppm })
    if (value.lengthSquared() > 0) this._body.setAwake(true)
  }

  /** 角速度（弧度/秒）。 */
  get angularVelocity(): number {
    return this._body.getAngularVelocity()
  }

  set angularVelocity(value: number) {
    // Box2D 在 fixedRotation 下仍会积分角速度；锁定旋转的刚体应完全不转
    if (this._body.isFixedRotation()) return
    this._body.setAngularVelocity(value)
    if (value !== 0) this._body.setAwake(true)
  }

  get sleeping(): boolean {
    return !this._body.isAwake()
  }

  set sleeping(value: boolean) {
    this._body.setAwake(!value)
  }

  /** 实际质量（kg）。 */
  get mass(): number {
    return this._body.getMass()
  }

  /** 冲量（kg·px/s），作用在质心偏移 `offset`（像素，全局方向）处。 */
  applyImpulse(impulse: Vector2, offset: Vector2 = Vector2.ZERO): void {
    const c = this._body.getWorldCenter()
    this._body.applyLinearImpulse(
      { x: impulse.x / this._ppm, y: impulse.y / this._ppm },
      { x: c.x + offset.x / this._ppm, y: c.y + offset.y / this._ppm },
      true,
    )
  }

  /** 力（kg·px/s²），只在下一个物理步内生效；持续施力需在每次 physicsProcess 中调用。 */
  applyForce(force: Vector2, offset: Vector2 = Vector2.ZERO): void {
    const c = this._body.getWorldCenter()
    this._body.applyForce(
      { x: force.x / this._ppm, y: force.y / this._ppm },
      { x: c.x + offset.x / this._ppm, y: c.y + offset.y / this._ppm },
      true,
    )
  }

  /** 角冲量（kg·px²/s）。 */
  applyTorqueImpulse(impulse: number): void {
    this._body.applyAngularImpulse(impulse / (this._ppm * this._ppm), true)
  }

  /** 力矩（kg·px²/s²），只在下一个物理步内生效。 */
  applyTorque(torque: number): void {
    this._body.applyTorque(torque / (this._ppm * this._ppm), true)
  }
}
