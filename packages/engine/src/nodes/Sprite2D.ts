import type { Texture } from '../core/assets'
import { clampColor, hex, Node2D, type Node2DOptions } from '../core/Node2D'
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
  /** 闪白的程度 0–1：贴图的形状叠一层 `flashColor`（受击、拾取时闪一下）。默认 0。 */
  flash?: number
  /** 闪光的颜色（0xRRGGBB），默认白色。 */
  flashColor?: number
}

const COLOR_PROPS: ReadonlySet<string> = new Set(['modulate', 'selfModulate', 'flashColor'])

/** 显示一张贴图。默认以贴图中心为 position，和刚体的质心天然对齐。 */
export class Sprite2D extends Node2D {
  private _texture: Texture | null
  private _centered: boolean
  private _offset: Vector2
  private _flipH: boolean
  private _flipV: boolean
  // 不叫 _flash：游戏的 Sprite2D 子类常自己有 _flash（闪白的计时器、补间），同名私有字段会编译失败
  private _flashAmount: number
  private _flashTint: number

  constructor(options: Sprite2DOptions = {}) {
    super(options)
    this._texture = options.texture ?? null
    this._centered = options.centered ?? true
    this._offset = options.offset ?? Vector2.ZERO
    this._flipH = options.flipH ?? false
    this._flipV = options.flipV ?? false
    this._flashAmount = clampFlash(options.flash ?? 0)
    this._flashTint = clampColor(options.flashColor ?? 0xffffff)
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

  /**
   * 闪白的程度 0–1：在贴图的形状上叠一层 `flashColor`，1 时整个形状变成纯色（透明的地方仍然透明）。
   * 受击时设成 1 再补间回 0：`sprite.flash = 1; sprite.createTween().to(sprite, { flash: 0 }, 0.12)`。
   * 和 `modulate` 不同，它能把颜色变亮。帧动画、图集的帧都照常可用；只作用于自己的贴图，不影响子节点。
   *
   * 实现：一张图第一次闪白时，在显存里生成一张同样大小的白色剪影（之后同一张图的所有帧、所有精灵共用）；
   * 闪白中的精灵上面多画一个剪影精灵，和原图合批。代价是每张闪过白的图多占一份显存。
   */
  get flash(): number {
    return this._flashAmount
  }

  set flash(value: number) {
    const v = clampFlash(value)
    if (v === this._flashAmount) return
    this._flashAmount = v
    this._version++
  }

  /** 闪光的颜色（0xRRGGBB），默认白色；受击闪红就设 `0xff4040`。补间时按 RGB 通道插值。 */
  get flashColor(): number {
    return this._flashTint
  }

  set flashColor(value: number) {
    this._flashTint = clampColor(value)
    this._version++
  }

  /** @internal Tween 对颜色属性按 RGB 通道插值。 */
  override get _colorProps(): ReadonlySet<string> {
    return COLOR_PROPS
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
      flash: this._flashAmount > 0 ? Math.round(this._flashAmount * 100) / 100 : undefined,
      flashColor: this._flashTint !== 0xffffff ? hex(this._flashTint) : undefined,
    }
  }
}

function clampFlash(value: number): number {
  return value > 0 ? Math.min(1, value) : 0 // NaN 也当 0
}
