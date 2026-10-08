import { Node2D } from '../../core/Node2D'
import type { Vector2 } from '../../math/Vector2'
import type { BodyProps } from '../../physics/PhysicsWorld'
import { CollisionObject2D, type CollisionObject2DOptions } from './CollisionObject2D'

export interface PhysicsBody2DOptions extends CollisionObject2DOptions {
  /** 摩擦系数，默认 0.5。 */
  friction?: number
  /** 弹性（恢复系数），0 不反弹，1 完全反弹。默认 0。 */
  bounce?: number
}

/**
 * 物理刚体的基类。碰撞形状由 CollisionShape2D 子节点提供。
 * 刚体的位置以物理世界为准：每个物理步之后写回 position 和 rotation（scale 不参与物理）。
 * 和其他刚体接触时，双方都会收到 `bodyEntered` / `bodyExited`。
 */
export abstract class PhysicsBody2D extends CollisionObject2D {
  readonly _isArea = false
  private _friction: number
  private _bounce: number
  /** 写回期间为 true，此时的 position 赋值不算“用户瞬移”。 */
  private _writingBack = false

  constructor(options: PhysicsBody2DOptions = {}) {
    super(options)
    this._friction = options.friction ?? 0.5
    this._bounce = options.bounce ?? 0
  }

  get friction(): number {
    return this._friction
  }

  set friction(value: number) {
    this._friction = value
    this._propsChanged()
  }

  get bounce(): number {
    return this._bounce
  }

  set bounce(value: number) {
    this._bounce = value
    this._propsChanged()
  }

  /** 当前正在接触的刚体。 */
  getCollidingBodies(): PhysicsBody2D[] {
    return this.isInsideTree ? (this.tree.physics._overlaps(this) as PhysicsBody2D[]) : []
  }

  /** @internal */
  override _props(): BodyProps {
    return { ...super._props(), friction: this._friction, bounce: this._bounce }
  }

  /** @internal */
  override _writeBack(globalPosition: Vector2, globalRotation: number): void {
    this._writingBack = true
    try {
      const parent = this._parent2D()
      if (parent) {
        // 父节点缩放为 0 时无法换算到局部坐标：这一步不写回，避免刚体被拉到父节点原点
        const inverse = parent.globalTransform.inverse()
        if (!inverse) return
        this.position = inverse.apply(globalPosition)
        this.rotation = globalRotation - parent.globalRotation
      } else {
        this.position = globalPosition
        this.rotation = globalRotation
      }
    } finally {
      this._writingBack = false
    }
  }

  /** @internal 用户赋值 position / rotation：瞬移刚体。 */
  override _transformChanged(): void {
    if (!this._writingBack && this.isInsideTree) this.tree.physics._teleport(this)
  }

  private _parent2D(): Node2D | null {
    for (let p = this.parent; p; p = p.parent) if (p instanceof Node2D) return p
    return null
  }

  protected override dumpProps(): Record<string, unknown> {
    return {
      ...super.dumpProps(),
      friction: this._friction !== 0.5 ? this._friction : undefined,
      bounce: this._bounce !== 0 ? this._bounce : undefined,
    }
  }
}

/** 不动的刚体：地面、墙壁。移动它（设置 position）会瞬移，但不会推动其他刚体。 */
export class StaticBody2D extends PhysicsBody2D {
  readonly _bodyType = 'static' as const
}
