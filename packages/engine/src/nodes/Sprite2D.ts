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
  #texture: Texture | null
  #centered: boolean
  #offset: Vector2
  #flipH: boolean
  #flipV: boolean

  constructor(options: Sprite2DOptions = {}) {
    super(options)
    this.#texture = options.texture ?? null
    this.#centered = options.centered ?? true
    this.#offset = options.offset ?? Vector2.ZERO
    this.#flipH = options.flipH ?? false
    this.#flipV = options.flipV ?? false
  }

  get texture(): Texture | null {
    return this.#texture
  }

  set texture(value: Texture | null) {
    this.#texture = value
    this._version++
  }

  get centered(): boolean {
    return this.#centered
  }

  set centered(value: boolean) {
    this.#centered = value
    this._version++
  }

  get offset(): Vector2 {
    return this.#offset
  }

  set offset(value: Vector2) {
    this.#offset = value
    this._version++
  }

  get flipH(): boolean {
    return this.#flipH
  }

  set flipH(value: boolean) {
    this.#flipH = value
    this._version++
  }

  get flipV(): boolean {
    return this.#flipV
  }

  set flipV(value: boolean) {
    this.#flipV = value
    this._version++
  }

  /** 贴图在局部坐标中占据的矩形（已考虑 centered 和 offset）；没有贴图或尺寸未知时为 null。 */
  get rect(): Rect2 | null {
    const t = this.#texture
    if (!t || t.width === 0 || t.height === 0) return null
    const x = (this.#centered ? -t.width / 2 : 0) + this.#offset.x
    const y = (this.#centered ? -t.height / 2 : 0) + this.#offset.y
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
      texture: this.#texture?.path ?? null,
      centered: this.#centered ? undefined : false,
      offset: this.#offset.equals(Vector2.ZERO) ? undefined : this.#offset,
      flipH: this.#flipH || undefined,
      flipV: this.#flipV || undefined,
    }
  }
}
