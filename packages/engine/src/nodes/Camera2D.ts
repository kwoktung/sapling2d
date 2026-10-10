import type { Node } from '../core/Node'
import { Node2D, type Node2DOptions } from '../core/Node2D'
import { Vector2 } from '../math/Vector2'

export interface Camera2DOptions extends Node2DOptions {
  /** 能否成为当前相机，默认 true。场景里第一个启用的相机自动成为当前相机。 */
  enabled?: boolean
  /** 画面中心相对相机位置的偏移（像素），例如让角色前方多看一点。默认 (0, 0)。 */
  offset?: Vector2
  /** 画面不超出的世界范围（像素）。默认没有限制。 */
  limitLeft?: number
  limitTop?: number
  limitRight?: number
  limitBottom?: number
  /** 平滑跟随，默认关闭。 */
  positionSmoothingEnabled?: boolean
  /** 平滑跟随的速度：每秒追上剩余距离的比例（指数衰减），默认 5。越大越跟手。 */
  positionSmoothingSpeed?: number
}

/**
 * 相机：当前相机的全局位置就是画面中心，场景（和 Autoload）随之平移。通常挂在玩家下面跟随玩家。
 *
 * ```ts
 * const camera = player.add(new Camera2D({ limitLeft: 0, limitRight: level.width * 16, limitTop: 0, limitBottom: level.height * 16 }))
 * ```
 *
 * - 同一时间只有一个当前相机：场景里第一个启用的相机自动成为当前相机，`makeCurrent()` 切换。没有相机时画面不偏移。
 * - 画面只平移：不支持缩放（zoom）和旋转。相机的位置是它真正的全局位置（祖先的旋转、缩放会影响它在哪里，
 *   例如挂在 `scale.x = -1` 的角色下面时，相机的局部位置会跟着镜像）；`offset` 按世界坐标加，不受影响。
 * - `limit*`：画面不超出这个范围；范围比屏幕可见区域小时，画面中心固定在范围的中心。
 * - 相机在每帧所有节点的 `process` 之后更新，平滑按帧时间推进（结果确定）；暂停时（相机不能处理）平滑停住。
 * - 屏幕坐标和世界坐标的换算用 `tree.viewport.screenToWorld` / `worldToScreen`；可见的世界范围是 `tree.viewport.visibleWorldRect`。
 */
export class Camera2D extends Node2D {
  offset: Vector2
  limitLeft: number
  limitTop: number
  limitRight: number
  limitBottom: number
  positionSmoothingEnabled: boolean
  positionSmoothingSpeed: number
  private _enabled: boolean
  /** @internal 上一次更新后的画面中心（世界坐标）；`_centerValid` 为 false 时下一次更新直接跳到目标（不平滑）。 */
  _centerX = 0
  _centerY = 0
  private _centerValid = false
  /** `_computeTarget` 的结果：应用了边界的目标画面中心。 */
  private _targetX = 0
  private _targetY = 0

  constructor(options: Camera2DOptions = {}) {
    super(options)
    this._enabled = options.enabled ?? true
    this.offset = options.offset ?? Vector2.ZERO
    this.limitLeft = options.limitLeft ?? -Infinity
    this.limitTop = options.limitTop ?? -Infinity
    this.limitRight = options.limitRight ?? Infinity
    this.limitBottom = options.limitBottom ?? Infinity
    this.positionSmoothingEnabled = options.positionSmoothingEnabled ?? false
    this.positionSmoothingSpeed = options.positionSmoothingSpeed ?? 5
  }

  get enabled(): boolean {
    return this._enabled
  }

  /** 关掉当前相机时，树里下一个启用的相机接替；没有就不偏移。打开时如果还没有当前相机，它成为当前相机。 */
  set enabled(value: boolean) {
    if (this._enabled === value) return
    this._enabled = value
    if (this.isInsideTree) this.tree._cameraManager.enabledChanged(this)
  }

  /** 是否是当前相机。 */
  get isCurrent(): boolean {
    return this.isInsideTree && this.tree._cameraManager.current === this
  }

  /** 成为当前相机（必须在树里且启用）。画面直接跳到它的位置，不平滑。 */
  makeCurrent(): void {
    this.tree._cameraManager.makeCurrent(this)
  }

  /** 平滑跟随时，下一次更新直接跳到目标位置（瞬移、换关时用）。 */
  resetSmoothing(): void {
    this._centerValid = false
  }

  /** 当前画面中心（世界坐标），已经应用了边界和平滑。下一次更新要直接跳过去时（刚成为当前相机、`resetSmoothing()` 之后），是此刻的目标位置。 */
  get screenCenter(): Vector2 {
    if (this._centerValid) return new Vector2(this._centerX, this._centerY)
    this._computeTarget()
    return new Vector2(this._targetX, this._targetY)
  }

  override _onEnterTree(): void {
    this.tree._cameraManager.add(this)
  }

  override _onExitTree(): void {
    this.tree._cameraManager.remove(this)
  }

  /** @internal 每帧 process 之后由 `CameraManager` 对当前相机调用：更新画面中心（世界坐标）。 */
  _step(dt: number): void {
    this._computeTarget()
    if (!this._centerValid || !this.positionSmoothingEnabled) {
      this._centerX = this._targetX
      this._centerY = this._targetY
      this._centerValid = true
      return
    }
    const k = 1 - Math.exp(-this.positionSmoothingSpeed * dt)
    this._centerX += (this._targetX - this._centerX) * k
    this._centerY += (this._targetY - this._centerY) * k
  }

  /** 目标画面中心 = 相机的全局位置 + offset，再按边界限制。逐级应用祖先的变换（和 globalPosition 相同），不分配内存。 */
  private _computeTarget(): void {
    let x = this.x
    let y = this.y
    for (let n: Node | null = this._canvasParent; n; n = n._canvasParent) {
      if (!(n instanceof Node2D)) continue
      const s = n.scale
      let px = x * s.x
      let py = y * s.y
      const r = n.rotation
      if (r !== 0) {
        const cos = Math.cos(r)
        const sin = Math.sin(r)
        const rx = cos * px - sin * py
        py = sin * px + cos * py
        px = rx
      }
      x = px + n.x
      y = py + n.y
    }
    const visible = this.tree.viewport.visibleRect
    this._targetX = clampCenter(x + this.offset.x, this.limitLeft, this.limitRight, visible.width / 2)
    this._targetY = clampCenter(y + this.offset.y, this.limitTop, this.limitBottom, visible.height / 2)
  }

  protected override dumpProps(): Record<string, unknown> {
    return {
      ...super.dumpProps(),
      current: this.isCurrent || undefined,
      enabled: this._enabled ? undefined : false,
      smoothing: this.positionSmoothingEnabled ? this.positionSmoothingSpeed : undefined,
    }
  }
}

/** 把画面中心限制在 [min + half, max - half] 里；范围比画面小时取范围的中心。 */
function clampCenter(center: number, min: number, max: number, half: number): number {
  const lo = min + half
  const hi = max - half
  if (lo > hi) return (min + max) / 2
  return center < lo ? lo : center > hi ? hi : center
}
