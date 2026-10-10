import type { Vector2 } from '../../math/Vector2'
import type { Node2D } from '../Node2D'

/** 节点现在能不能接收指针（没有等待销毁、在树里可见、能处理）。 */
export function canHit(n: Node2D): boolean {
  return !n.isQueuedForDeletion && n.isVisibleInTree && n.canProcess()
}

/**
 * 节点能不能被点中、指针在不在它的点击区域里：节点拾取和屏幕按钮共用。
 * CanvasLayer 里的节点按设计坐标判断（`inLayer` 不传时自己找）。
 */
export function hitsAt(n: Node2D, world: Vector2, design: Vector2, inLayer?: boolean): boolean {
  if (!canHit(n)) return false
  // 缩放为 0 时变换不可逆：节点在屏幕上没有面积，不可能被点中（toLocal 会退化成原点，导致全屏误判）
  const inverse = n.globalTransform.inverse()
  if (!inverse) return false
  return n.hitTest(inverse.apply((inLayer ?? n._canvasLayer !== null) ? design : world))
}
