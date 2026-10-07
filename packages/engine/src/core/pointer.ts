import type { Vector2 } from '../math/Vector2'

/** 节点收到的指针事件。坐标都是设计坐标。 */
export interface PointerEvent2D {
  /** 指针 id：鼠标恒为 1，触摸为各手指的 identifier。 */
  readonly pointerId: number
  /** 全局位置（设计坐标）。 */
  readonly position: Vector2
  /** 相对于收到事件的节点的局部坐标。 */
  readonly localPosition: Vector2
}

/** 圆形点击区域（局部坐标）。 */
export interface CircleHitArea {
  readonly radius: number
  readonly center?: Vector2
}
