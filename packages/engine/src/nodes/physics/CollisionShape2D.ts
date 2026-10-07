import { Node2D, type Node2DOptions } from '../../core/Node2D'
import type { Shape2D } from '../../physics/shapes'
import { CollisionObject2D } from './CollisionObject2D'

export interface CollisionShape2DOptions extends Node2DOptions {
  shape?: Shape2D | null
  /** 禁用后不参与碰撞。 */
  disabled?: boolean
}

/**
 * 给碰撞对象提供形状。必须是 CollisionObject2D（RigidBody2D、StaticBody2D、Area2D）的直接子节点；position 和 rotation 是形状在刚体内的偏移
 * （scale 不影响形状，尺寸以 shape 为准）。
 *
 * ```ts
 * const ball = this.add(new RigidBody2D({ position: v(375, 100) }))
 * ball.add(new CollisionShape2D({ shape: circle(30) }))
 * ```
 */
export class CollisionShape2D extends Node2D {
  #shape: Shape2D | null
  #disabled: boolean

  constructor(options: CollisionShape2DOptions = {}) {
    super(options)
    this.#shape = options.shape ?? null
    this.#disabled = options.disabled ?? false
  }

  get shape(): Shape2D | null {
    return this.#shape
  }

  set shape(value: Shape2D | null) {
    this.#shape = value
    this.#notifyBody()
  }

  get disabled(): boolean {
    return this.#disabled
  }

  set disabled(value: boolean) {
    this.#disabled = value
    this.#notifyBody()
  }

  /** @internal */
  override _onEnterTree(): void {
    if (!(this.parent instanceof CollisionObject2D)) {
      console.warn(`CollisionShape2D "${this.name}" only works as a direct child of a CollisionObject2D (RigidBody2D, StaticBody2D, Area2D); its parent is ${this.parent?.constructor.name ?? 'none'}.`)
    }
    this.#notifyBody()
  }

  /** @internal */
  override _onExitTree(): void {
    this.#notifyBody()
  }

  override _transformChanged(): void {
    this.#notifyBody()
  }

  #notifyBody(): void {
    if (this.parent instanceof CollisionObject2D) this.parent._shapesChanged()
  }

  protected override dumpProps(): Record<string, unknown> {
    return {
      ...super.dumpProps(),
      shape: this.#shape ? this.#shape.toString() : null,
      disabled: this.#disabled || undefined,
    }
  }
}
