import { CollisionObject2D, type CollisionObject2DOptions } from './CollisionObject2D'
import type { PhysicsBody2D } from './PhysicsBody2D'

export interface Area2DOptions extends CollisionObject2DOptions {}

/**
 * 检测区域（传感器）：检测刚体的进入和离开，但不参与碰撞解算、不会推动任何东西。
 * 形状由 CollisionShape2D 子节点提供。
 *
 * ```ts
 * const deadline = this.add(new Area2D({ position: v(375, 200) }))
 * deadline.add(new CollisionShape2D({ shape: rectangle(750, 10) }))
 * deadline.bodyEntered.connect((body) => this.checkGameOver(body), this)
 * ```
 *
 * 区域跟随自己（及祖先）的全局变换移动，可以挂在会动的节点下面。
 * 检测对象是 RigidBody2D；静态刚体和其他区域不会被检测到。
 */
export class Area2D extends CollisionObject2D {
  readonly _bodyType = 'kinematic' as const
  readonly _isArea = true

  /** 当前在区域内的刚体。 */
  getOverlappingBodies(): PhysicsBody2D[] {
    return this.isInsideTree ? (this.tree.physics._overlaps(this) as PhysicsBody2D[]) : []
  }

  /** 某个刚体是否在区域内。 */
  overlapsBody(body: PhysicsBody2D): boolean {
    return this.getOverlappingBodies().includes(body)
  }
}
