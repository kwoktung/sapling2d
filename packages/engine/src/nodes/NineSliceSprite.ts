import type { Texture } from '../core/assets'
import { Node2D, type Node2DOptions } from '../core/Node2D'
import { Rect2 } from '../math/Rect2'
import { Vector2 } from '../math/Vector2'

/** 九宫格的四个边距（像素，按贴图裁剪前的原始尺寸）。 */
export interface NineSliceMargins {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export interface NineSliceSpriteOptions extends Node2DOptions {
  texture?: Texture | null
  /** 四个边距（像素）；一个数字表示四边相同。默认 0（整张图直接拉伸）。 */
  margins?: NineSliceMargins | number
  /** 宽和高（像素）。默认 (0, 0)。 */
  size?: Vector2
}

/**
 * 九宫格（对应 Godot 的 NinePatchRect）：界面边框、按钮、对话框、卡片。一张边框贴图按四个边距切成 9 块，
 * 四个角不缩放，上下边只横向拉伸，左右边只纵向拉伸，中间两个方向都拉伸，拉成任意 `size` 边框都不变形。
 *
 * ```ts
 * const card = hud.add(new NineSliceSprite({ texture: UI.get('panel_wood'), margins: 24, size: v(560, 200), position: v(95, 400) }))
 * card.inputPickable = true // 没设 hitArea 时点击区域就是这个矩形
 * ```
 *
 * - 原点在**左上角**（和 `ColorRect` 一样），矩形向右下方展开；`size` 可以补间（卡片展开）。
 * - 边距按贴图的原始尺寸（裁剪前）算；图集里裁掉透明边的帧也能用。
 * - `size` 比左右（上下）边距之和还小时，四个角按比例缩小，不会重叠。
 * - `selfModulate` 给边框染色；`modulate`、`alpha`、`blendMode` 和其他 Node2D 一样。
 */
export class NineSliceSprite extends Node2D {
  private _texture: Texture | null
  private _margins: NineSliceMargins
  private _size: Vector2

  constructor(options: NineSliceSpriteOptions = {}) {
    super(options)
    this._texture = options.texture ?? null
    this._margins = toMargins(options.margins ?? 0)
    this._size = options.size ?? Vector2.ZERO
  }

  get texture(): Texture | null {
    return this._texture
  }

  set texture(value: Texture | null) {
    this._texture = value
    this._version++
  }

  /** 四个边距；赋值时可以传一个数字（四边相同）。 */
  get margins(): NineSliceMargins {
    return this._margins
  }

  set margins(value: NineSliceMargins | number) {
    this._margins = toMargins(value)
    this._version++
  }

  get size(): Vector2 {
    return this._size
  }

  set size(value: Vector2) {
    this._size = value
    this._version++
  }

  /** 矩形在局部坐标里的范围：(0, 0) 到 size。 */
  get rect(): Rect2 {
    return new Rect2(0, 0, this._size.x, this._size.y)
  }

  /** 没有设置 hitArea 时，用矩形范围做点击检测。 */
  override hitTest(localPoint: Vector2): boolean {
    if (this.hitArea) return super.hitTest(localPoint)
    const s = this._size
    return localPoint.x >= 0 && localPoint.y >= 0 && localPoint.x <= s.x && localPoint.y <= s.y
  }

  protected override dumpProps(): Record<string, unknown> {
    const m = this._margins
    const uniform = m.left === m.top && m.left === m.right && m.left === m.bottom
    return {
      ...super.dumpProps(),
      texture: this._texture?.path ?? null,
      size: this._size,
      margins: uniform ? (m.left === 0 ? undefined : m.left) : `${m.left},${m.top},${m.right},${m.bottom}`,
    }
  }
}

function toMargins(value: NineSliceMargins | number): NineSliceMargins {
  const m = typeof value === 'number' ? { left: value, top: value, right: value, bottom: value } : value
  for (const side of ['left', 'top', 'right', 'bottom'] as const) {
    const n = m[side]
    if (!(n >= 0) || !Number.isFinite(n)) throw new Error(`NineSliceSprite: margin ${side} must be a finite number >= 0, got ${n}.`)
  }
  return Object.freeze({ left: m.left, top: m.top, right: m.right, bottom: m.bottom })
}
