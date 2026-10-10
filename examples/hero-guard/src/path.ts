import { Curve2D, v, type Vector2 } from 'sapling2d'
import { FIELD, PATH } from './config'

/**
 * 怪物的随机路线：控制点从出生高度到底线，每隔 `stepY` 一个，横坐标随机但相邻两点不超过 `maxDx`；
 * 用 `Curve2D.catmullRom` 连成平滑曲线（按弧长取点，不出尖角）。`randf(from, to)` 传 `tree.rng.randfRange`。
 */
export function randomPath(randf: (from: number, to: number) => number, startX?: number, startY = FIELD.spawnY): Curve2D {
  const points: Vector2[] = []
  let x = startX ?? randf(FIELD.left + 40, FIELD.right - 40)
  let y = startY
  points.push(v(x, y))
  while (y < FIELD.baseY) {
    y = Math.min(FIELD.baseY, y + PATH.stepY + randf(-PATH.jitterY, PATH.jitterY))
    x = Math.min(FIELD.right, Math.max(FIELD.left, x + randf(-PATH.maxDx, PATH.maxDx)))
    points.push(v(x, y))
  }
  // 最后一段竖直越过底线（越过底线才算漏掉）
  points.push(v(x, FIELD.baseY + 40))
  return Curve2D.catmullRom(points)
}

/** 竖直的直线路线（测试用）。 */
export function linePath(x: number, y0: number, y1: number): Curve2D {
  return Curve2D.polyline([v(x, y0), v(x, y1)])
}
