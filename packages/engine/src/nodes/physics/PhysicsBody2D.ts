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
  #friction: number
  #bounce: number
  /** 写回期间为 true，此时的 position 赋值不算“用户瞬移”。 */
  #writingBack = false

  constructor(options: PhysicsBody2DOptions = {}) {
    super(options)
    this.#friction = options.friction ?? 0.5
    this.#bounce = options.bounce ?? 0
  }

  get friction(): number {
    return this.#friction
  }

  set friction(value: number) {
    this.#friction = value
    this._propsChanged()
  }

  get bounce(): number {
    return this.#bounce
  }

  set bounce(value: number) {
    this.#bounce = value
    this._propsChanged()
  }

  /** 当前正在接触的刚体。 */
  getCollidingBodies(): PhysicsBody2D[] {
    return this.isInsideTree ? (this.tree.physics._overlaps(this) as PhysicsBody2D[]) : []
  }

  /** @internal */
  override _props(): BodyProps {
    return { ...super._props(), friction: this.#friction, bounce: this.#bounce }
  }

  /** @internal */
  override _writeBack(globalPosition: Vector2, globalRotation: number): void {
    this.#writingBack = true
    try {
      const parent = this.#parent2D()
      if (parent) {
        this.position = parent.toLocal(globalPosition)
        this.rotation = globalRotation - parent.globalRotation
      } else {
        this.position = globalPosition
        this.rotation = globalRotation
      }
    } finally {
      this.#writingBack = false
    }
  }

  /** @internal 用户赋值 position / rotation：瞬移刚体。 */
  override _transformChanged(): void {
    if (!this.#writingBack && this.isInsideTree) this.tree.physics._teleport(this)
  }

  #parent2D(): Node2D | null {
    for (let p = this.parent; p; p = p.parent) if (p instanceof Node2D) return p
    return null
  }

  protected override dumpProps(): Record<string, unknown> {
    return {
      ...super.dumpProps(),
      friction: this.#friction !== 0.5 ? this.#friction : undefined,
      bounce: this.#bounce !== 0 ? this.#bounce : undefined,
    }
  }
}

/** 不动的刚体：地面、墙壁。移动它（设置 position）会瞬移，但不会推动其他刚体。 */
export class StaticBody2D extends PhysicsBody2D {
  readonly _bodyType = 'static' as const
}
