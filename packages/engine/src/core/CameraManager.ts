import type { Camera2D } from '../nodes/Camera2D'
import type { Viewport } from './Viewport'

/**
 * 树里的相机：登记进出树的相机，决定当前相机，每帧按当前相机算出画面偏移（写到 `Viewport._canvasX/Y`）。
 * 同一时间只有一个当前相机：第一个启用的相机自动成为当前相机；当前相机离开树或被关掉时，下一个启用的接替；没有相机时画面不偏移。
 * 相机自己的状态（位置、边界、平滑）在 `Camera2D` 里。
 */
export class CameraManager {
  private readonly _viewport: Viewport
  /** 树里的相机，按进入树的顺序。 */
  private readonly _cameras: Camera2D[] = []
  private _current: Camera2D | null = null

  constructor(viewport: Viewport) {
    this._viewport = viewport
  }

  /** 当前相机；没有时为 null。 */
  get current(): Camera2D | null {
    return this._current
  }

  /** 相机进入树：还没有当前相机时，启用的相机成为当前相机。 */
  add(camera: Camera2D): void {
    this._cameras.push(camera)
    if (camera.enabled && !this._current) this.makeCurrent(camera)
  }

  /** 相机离开树：它是当前相机时，下一个启用的接替。 */
  remove(camera: Camera2D): void {
    const i = this._cameras.indexOf(camera)
    if (i >= 0) this._cameras.splice(i, 1)
    if (this._current === camera) this._pickNext()
  }

  /** 树里的相机被打开或关掉：关掉的是当前相机时下一个接替；打开时还没有当前相机，它成为当前相机。 */
  enabledChanged(camera: Camera2D): void {
    if (!camera.enabled && this._current === camera) this._pickNext()
    else if (camera.enabled && !this._current) this.makeCurrent(camera)
  }

  /** 让 `camera` 成为当前相机（必须启用）。画面直接跳到它的位置，不平滑。`Camera2D.makeCurrent()` 也走这里。 */
  makeCurrent(camera: Camera2D): void {
    if (!camera.enabled) throw new Error(`Camera2D "${camera.name}" is disabled; set enabled = true before makeCurrent().`)
    this._current = camera
    camera.resetSmoothing()
  }

  /** 每帧所有节点移动完、帧末销毁之后（渲染之前）调用：推进当前相机，按它的画面中心算出画面偏移。 */
  update(dt: number): void {
    const camera = this._current
    const viewport = this._viewport
    if (!camera) {
      viewport._canvasX = 0
      viewport._canvasY = 0
      return
    }
    // 暂停时（相机不能处理）平滑不推进；没有平滑的相机照样对准目标（目标只会被不受暂停影响的节点移动）
    camera._step(camera.canProcess() ? dt : 0)
    // 世界坐标 + 偏移 = 设计坐标；画面中心对准设计区域的中心
    viewport._canvasX = viewport.designWidth / 2 - camera._centerX
    viewport._canvasY = viewport.designHeight / 2 - camera._centerY
  }

  /** 选下一个启用的相机作为当前相机（没有就不偏移）。 */
  private _pickNext(): void {
    this._current = null
    for (const camera of this._cameras) {
      if (camera.enabled && camera.isInsideTree) {
        this.makeCurrent(camera)
        return
      }
    }
  }
}
