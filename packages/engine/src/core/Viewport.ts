import { Rect2 } from '../math/Rect2'
import { Vector2 } from '../math/Vector2'
import { Signal } from './Signal'

/**
 * 拉伸模式（对应 Godot 的 stretch aspect）：
 * - `expand`（默认）：等比缩放到设计区域刚好放下，多出来的空间向两侧对称扩展，游戏可以画到 `visibleRect` 里的任何位置。
 * - `keep`：等比缩放，设计区域之外留黑边，画面被裁剪到设计区域内。
 */
export type StretchAspect = 'expand' | 'keep'

export interface DesignResolution {
  /** 设计宽度（像素），游戏坐标以它为准。 */
  width: number
  height: number
  aspect?: StretchAspect
}

/** 平台提供的屏幕信息，单位是窗口的逻辑像素（CSS 像素 / 小游戏的 windowWidth）。 */
export interface ScreenInfo {
  width: number
  height: number
  /** 设备像素比。 */
  pixelRatio: number
  /** 安全区（不被刘海、圆角、Home 条遮挡的区域），窗口坐标。不传时等于整个窗口。 */
  safeArea?: { left: number; top: number; right: number; bottom: number }
}

/** 渲染分辨率上限：DPR 更高的设备也只按 2 倍渲染，以兼顾性能。 */
export const MAX_RENDER_RESOLUTION = 2

/**
 * 视口：把平台的屏幕映射到游戏的设计坐标。通过 `this.tree.viewport` 访问。
 *
 * 游戏里的所有坐标都是设计坐标（例如 750×1334）。设计区域在屏幕上等比缩放并居中：
 * 设计坐标 (0, 0) 不一定是屏幕左上角，屏幕左上角是 `visibleRect.position`。
 */
export class Viewport {
  readonly designWidth: number
  readonly designHeight: number
  readonly aspect: StretchAspect
  /** 屏幕尺寸、DPR 或安全区变化后触发。 */
  readonly resized = new Signal()

  #screen!: Required<ScreenInfo>
  #scale = 1
  #offset = Vector2.ZERO
  #visibleRect!: Rect2
  #safeRect!: Rect2
  /** @internal 每次 update 递增，渲染层据此判断是否需要调整画布。 */
  _version = 0

  constructor(design: DesignResolution, screen: ScreenInfo) {
    this.designWidth = design.width
    this.designHeight = design.height
    this.aspect = design.aspect ?? 'expand'
    this._update(screen, false)
  }

  /** 设计区域：`(0, 0, designWidth, designHeight)`。 */
  get designRect(): Rect2 {
    return new Rect2(0, 0, this.designWidth, this.designHeight)
  }

  /**
   * 屏幕上实际可见的区域（设计坐标）。`expand` 模式下可能比设计区域大，`keep` 模式下等于设计区域。
   * 需要贴屏幕边缘的 UI 应以它为准。
   */
  get visibleRect(): Rect2 {
    return this.#visibleRect
  }

  /** 安全区（设计坐标），已与 visibleRect 求交。放按钮、分数等重要 UI 时以它为准。 */
  get safeRect(): Rect2 {
    return this.#safeRect
  }

  /** 1 个设计像素等于多少个窗口逻辑像素。 */
  get scale(): number {
    return this.#scale
  }

  /** 设计坐标原点在窗口中的位置（窗口逻辑像素）。 */
  get offset(): Vector2 {
    return this.#offset
  }

  /** 当前屏幕信息（窗口逻辑像素）。 */
  get screen(): Readonly<Required<ScreenInfo>> {
    return this.#screen
  }

  /** 渲染分辨率：min(DPR, 2)。 */
  get renderResolution(): number {
    return Math.min(this.#screen.pixelRatio, MAX_RENDER_RESOLUTION)
  }

  /** 窗口坐标 → 设计坐标。 */
  screenToDesign(p: Vector2): Vector2 {
    return new Vector2((p.x - this.#offset.x) / this.#scale, (p.y - this.#offset.y) / this.#scale)
  }

  /** 设计坐标 → 窗口坐标。 */
  designToScreen(p: Vector2): Vector2 {
    return new Vector2(p.x * this.#scale + this.#offset.x, p.y * this.#scale + this.#offset.y)
  }

  /** @internal 由平台的 resize 事件驱动。 */
  _update(screen: ScreenInfo, emit = true): void {
    const safeArea = screen.safeArea ?? { left: 0, top: 0, right: screen.width, bottom: screen.height }
    this.#screen = { width: screen.width, height: screen.height, pixelRatio: screen.pixelRatio, safeArea }
    const scale = Math.min(screen.width / this.designWidth, screen.height / this.designHeight)
    this.#scale = scale
    this.#offset = new Vector2((screen.width - this.designWidth * scale) / 2, (screen.height - this.designHeight * scale) / 2)

    this.#visibleRect =
      this.aspect === 'keep'
        ? this.designRect
        : new Rect2((0 - this.#offset.x) / scale, (0 - this.#offset.y) / scale, screen.width / scale, screen.height / scale) // 0 - x：避免 -0

    const tl = this.screenToDesign(new Vector2(safeArea.left, safeArea.top))
    const br = this.screenToDesign(new Vector2(safeArea.right, safeArea.bottom))
    this.#safeRect = new Rect2(tl.x, tl.y, br.x - tl.x, br.y - tl.y).intersection(this.#visibleRect)

    this._version++
    if (emit) this.resized.emit()
  }
}
