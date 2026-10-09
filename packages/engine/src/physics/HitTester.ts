import type { CircleShape2D, RectangleShape2D } from './shapes'

/**
 * 参与 HitTester 判定的对象。节点只要加一个 `hitShape` 字段就满足（`x`、`y` 来自 Node2D）；普通对象也行。
 *
 * - 形状以 `(x, y)` 为中心，不随 rotation / scale 变化（矩形永远轴对齐）。
 * - `x`、`y` 是局部坐标：互相比较的两组对象要在同一个坐标系里（同一个父节点，或父节点之间没有相对变换）。
 * - 失效的对象不参与判定：`dead` 为 true，或节点已经 `queueFree()` / 已销毁。
 *   只看对象自身：父节点 `queueFree()` 后，子节点要等帧末真正销毁才算失效。
 */
export interface Hittable {
  readonly x: number
  readonly y: number
  readonly hitShape: CircleShape2D | RectangleShape2D
  readonly dead?: boolean
}

const CIRCLE = 0
const RECT = 1
const GONE = 2

/** 可能失效的对象：游戏自己的 `dead` 字段，或节点的删除状态。 */
interface Mortal {
  readonly dead?: boolean
  readonly isQueuedForDeletion?: boolean
  readonly isFreed?: boolean
}

function isGone(o: Mortal): boolean {
  // isFreed 也要看：节点销毁后 isQueuedForDeletion 会变回 false
  return o.dead === true || o.isQueuedForDeletion === true || o.isFreed === true
}

/** 形状的类型编号；polygon 不支持。 */
function kindOf(shape: CircleShape2D | RectangleShape2D): number {
  const kind = shape.kind as string
  if (kind === 'circle') return CIRCLE
  if (kind === 'rectangle') return RECT
  throw new Error(`HitTester supports circle and rectangle shapes, got ${String(shape)}; use Area2D for polygons`)
}

/**
 * 不走物理引擎的碰撞判定：只回答“两组对象里谁和谁重叠”，没有任何物理反应。
 * 用于子弹、道具这类数量多、只需要命中判定的对象（几百个也不用刚体，iOS 小游戏的刚体预算只有 60–80 个）。
 *
 * 每次调用比较 a 组 × b 组的每一对（组内不比较）。b 组的位置和形状先读进复用的数组，
 * a 组每个对象只读一次，内层循环只做算术，每帧不分配内存。
 */
export class HitTester {
  private _kind = new Uint8Array(64)
  private _x = new Float64Array(64)
  private _y = new Float64Array(64)
  /** 圆：半径；矩形：半宽。 */
  private _ha = new Float64Array(64)
  /** 矩形：半高。 */
  private _hb = new Float64Array(64)

  /**
   * 对每一对重叠的 (a, b) 调用 `hit`（恰好接触也算）。`hit` 返回 true 表示 a 已经用掉了（比如子弹打中了），
   * 不再和其他 b 比较。回调里让 b 失效（`dead = true` 或 `queueFree()`）后，后面的 a 不会再碰到它。
   * `as` 和 `bs` 可以是同一个数组（组内互相判定），这时对象不和自己比较，每一对会以 (a, b) 和 (b, a) 各报告一次。
   */
  forEachHit<A extends Hittable, B extends Hittable>(as: readonly A[], bs: readonly B[], hit: (a: A, b: B) => boolean): void {
    const n = bs.length
    if (n === 0 || as.length === 0) return
    if (this._x.length < n) this._grow(n)
    const kinds = this._kind
    const xs = this._x
    const ys = this._y
    const has = this._ha
    const hbs = this._hb
    const self = (as as readonly Hittable[]) === bs
    for (let j = 0; j < n; j++) {
      const b = bs[j]!
      if (isGone(b)) {
        kinds[j] = GONE
        continue
      }
      const shape = b.hitShape
      const kind = kindOf(shape)
      kinds[j] = kind
      xs[j] = b.x
      ys[j] = b.y
      if (kind === CIRCLE) has[j] = (shape as CircleShape2D).radius
      else {
        has[j] = (shape as RectangleShape2D).width / 2
        hbs[j] = (shape as RectangleShape2D).height / 2
      }
    }
    for (let i = 0; i < as.length; i++) {
      const a = as[i]!
      if (isGone(a)) continue
      const shape = a.hitShape
      const aKind = kindOf(shape)
      const ax = a.x
      const ay = a.y
      let aa: number
      let ab = 0
      if (aKind === CIRCLE) aa = (shape as CircleShape2D).radius
      else {
        aa = (shape as RectangleShape2D).width / 2
        ab = (shape as RectangleShape2D).height / 2
      }
      for (let j = 0; j < n; j++) {
        const bKind = kinds[j]!
        if (bKind === GONE || (self && j === i)) continue
        const dx = ax - xs[j]!
        const dy = ay - ys[j]!
        if (aKind === CIRCLE) {
          if (bKind === CIRCLE) {
            const r = aa + has[j]!
            if (dx * dx + dy * dy > r * r) continue
          } else if (!circleRect(dx, dy, aa, has[j]!, hbs[j]!)) continue
        } else if (bKind === CIRCLE) {
          if (!circleRect(dx, dy, has[j]!, aa, ab)) continue
        } else if (Math.abs(dx) > aa + has[j]! || Math.abs(dy) > ab + hbs[j]!) continue
        const b = bs[j]!
        if (isGone(b)) {
          kinds[j] = GONE
          continue
        }
        if (hit(a, b)) break
        if (isGone(b)) kinds[j] = GONE
      }
    }
  }

  /** 原地去掉已经失效的对象（`dead`、已 `queueFree()` 或已销毁），不分配新数组。不要求对象有 `hitShape`。 */
  static compact<T extends Mortal>(list: T[]): void {
    let w = 0
    for (let i = 0; i < list.length; i++) {
      const item = list[i]!
      if (!isGone(item)) list[w++] = item
    }
    list.length = w
  }

  private _grow(n: number) {
    const size = Math.max(n, this._x.length * 2)
    this._kind = new Uint8Array(size)
    this._x = new Float64Array(size)
    this._y = new Float64Array(size)
    this._ha = new Float64Array(size)
    this._hb = new Float64Array(size)
  }
}

/** 圆（圆心相对矩形中心偏移 dx, dy，半径 r）和矩形（半宽 hw、半高 hh）是否重叠：圆心到矩形最近点的距离 ≤ r。 */
function circleRect(dx: number, dy: number, r: number, hw: number, hh: number): boolean {
  const ex = Math.abs(dx) - hw
  const ey = Math.abs(dy) - hh
  const qx = ex > 0 ? ex : 0
  const qy = ey > 0 ? ey : 0
  return qx * qx + qy * qy <= r * r
}
