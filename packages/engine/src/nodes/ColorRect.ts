import { clampColor, hex, Node2D, type Node2DOptions } from '../core/Node2D'
import { Rect2 } from '../math/Rect2'
import { Vector2 } from '../math/Vector2'

export interface ColorRectOptions extends Node2DOptions {
  /** 宽和高（像素）。默认 (0, 0)。 */
  size?: Vector2
  /** 颜色 0xRRGGBB，默认白色。透明度用 `alpha`。 */
  color?: number
}

const COLOR_PROPS: ReadonlySet<string> = new Set(['modulate', 'selfModulate', 'color'])

/**
 * 纯色矩形：血条、遮罩、转场黑幕。原点在**左上角**（和 Godot 一样），矩形向右下方展开，
 * 所以血条改 `scale.x`（或 `size`）就是从左往右缩。
 *
 * ```ts
 * const bar = hud.add(new ColorRect({ position: v(40, 40), size: v(300, 24), color: 0xe04040 }))
 * bar.scale = v(hp / maxHp, 1)
 * ```
 *
 * - `color` 和 `size` 都可以补间（颜色按 RGB 通道插值）。透明度、`modulate`、`selfModulate`、`zIndex` 和其他 Node2D 一样。
 * - 没有设置 `hitArea` 时，点击区域就是这个矩形（无头模式下也是）。
 * - 和贴图一起合批绘制（用的是白色贴图染色），大量使用不会增加绘制调用。
 */
export class ColorRect extends Node2D {
  private _size: Vector2
  private _color: number

  constructor(options: ColorRectOptions = {}) {
    super(options)
    this._size = options.size ?? Vector2.ZERO
    this._color = clampColor(options.color ?? 0xffffff)
  }

  get size(): Vector2 {
    return this._size
  }

  set size(value: Vector2) {
    this._size = value
    this._version++
  }

  get color(): number {
    return this._color
  }

  set color(value: number) {
    this._color = clampColor(value)
    this._version++
  }

  /** 矩形在局部坐标里的范围：(0, 0) 到 size。 */
  get rect(): Rect2 {
    return new Rect2(0, 0, this._size.x, this._size.y)
  }

  /** @internal Tween 对颜色属性按 RGB 通道插值。 */
  override get _colorProps(): ReadonlySet<string> {
    return COLOR_PROPS
  }

  /** 没有设置 hitArea 时，用矩形范围做点击检测。 */
  override hitTest(localPoint: Vector2): boolean {
    if (this.hitArea) return super.hitTest(localPoint)
    const s = this._size
    return localPoint.x >= 0 && localPoint.y >= 0 && localPoint.x <= s.x && localPoint.y <= s.y
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), size: this._size, color: hex(this._color) }
  }
}
