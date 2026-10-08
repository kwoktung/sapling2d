import type { Texture } from '../core/assets'
import { Node2D, type Node2DOptions } from '../core/Node2D'
import { Rect2 } from '../math/Rect2'
import { Vector2 } from '../math/Vector2'

export interface Sprite2DOptions extends Node2DOptions {
  texture?: Texture | null
  /** 以贴图中心为原点（默认 true）。为 false 时原点在左上角。 */
  centered?: boolean
  /** 贴图相对节点原点的偏移（像素）。 */
  offset?: Vector2
  flipH?: boolean
  flipV?: boolean
}

/** 显示一张贴图。默认以贴图中心为 position，和刚体的质心天然对齐。 */
export class Sprite2D extends Node2D {
  private _texture: Texture | null
  private _centered: boolean
  private _offset: Vector2
  private _flipH: boolean
  private _flipV: boolean

  constructor(options: Sprite2DOptions = {}) {
    super(options)
    this._texture = options.texture ?? null
    this._centered = options.centered ?? true
    this._offset = options.offset ?? Vector2.ZERO
    this._flipH = options.flipH ?? false
    this._flipV = options.flipV ?? false
  }

  get texture(): Texture | null {
    return this._texture
  }

  set texture(value: Texture | null) {
    this._texture = value
    this._version++
  }

  get centered(): boolean {
    return this._centered
  }

  set centered(value: boolean) {
    this._centered = value
    this._version++
  }

  get offset(): Vector2 {
    return this._offset
  }

  set offset(value: Vector2) {
    this._offset = value
    this._version++
  }

  get flipH(): boolean {
    return this._flipH
  }

  set flipH(value: boolean) {
    this._flipH = value
    this._version++
  }

  get flipV(): boolean {
    return this._flipV
  }

  set flipV(value: boolean) {
    this._flipV = value
    this._version++
  }

  /** 贴图在局部坐标中占据的矩形（已考虑 centered 和 offset）；没有贴图或尺寸未知时为 null。 */
  get rect(): Rect2 | null {
    const t = this._texture
    if (!t || t.width === 0 || t.height === 0) return null
    const x = (this._centered ? -t.width / 2 : 0) + this._offset.x
    const y = (this._centered ? -t.height / 2 : 0) + this._offset.y
    return new Rect2(x, y, t.width, t.height)
  }

  /** 没有设置 hitArea 时，用贴图范围做点击检测。 */
  override hitTest(localPoint: Vector2): boolean {
    if (this.hitArea) return super.hitTest(localPoint)
    return this.rect?.contains(localPoint) ?? false
  }

  protected override dumpProps(): Record<string, unknown> {
    return {
      ...super.dumpProps(),
      texture: this._texture?.path ?? null,
      centered: this._centered ? undefined : false,
      offset: this._offset.equals(Vector2.ZERO) ? undefined : this._offset,
      flipH: this._flipH || undefined,
      flipV: this._flipV || undefined,
    }
  }
}
