import { Rect2 } from '../math/Rect2'
import { Transform2D } from '../math/Transform2D'
import { Vector2 } from '../math/Vector2'
import { Node, type NodeOptions } from './Node'
import type { CircleHitArea, PointerEvent2D } from './pointer'
import { Signal } from './Signal'

export interface Node2DOptions extends NodeOptions {
  position?: Vector2
  /** 弧度。 */
  rotation?: number
  scale?: Vector2
  visible?: boolean
  zIndex?: number
  /** 不透明度 0–1，作用于自己和子节点。默认 1。 */
  alpha?: number
  /** 颜色乘子（0xRRGGBB），作用于自己和子节点。默认 0xffffff（不改变颜色）。 */
  modulate?: number
  /** 颜色乘子（0xRRGGBB），只作用于自己的贴图 / 文字，不影响子节点。默认 0xffffff。 */
  selfModulate?: number
  /** 是否接收指针事件（pointerDown 等信号）。默认 false。 */
  inputPickable?: boolean
  /** 点击区域（局部坐标）。不设置时，Sprite2D 用贴图范围，其他节点无法被点中。 */
  hitArea?: Rect2 | CircleHitArea | null
}

/**
 * 带 2D 变换的节点。变换数据由节点自己持有（见 ADR 0002），渲染层每帧把有变化的节点同步给渲染器。
 * 单位是像素，y 轴向下，角度用弧度。
 */
export class Node2D extends Node {
  // x / y 存成数字：`x += …` 不分配对象（iOS 小游戏上分配很贵，见 spikes/bullets/REPORT.md）。
  // position 在读取时才创建 Vector2，并缓存到下一次修改
  private _x: number
  private _y: number
  private _positionCache: Vector2 | null = null
  private _rotation: number
  private _scale: Vector2
  private _visible: boolean
  private _zIndex: number
  private _alpha: number
  private _modulate: number
  private _selfModulate: number
  private _pointerDown: Signal<[event: PointerEvent2D]> | null = null
  private _pointerMove: Signal<[event: PointerEvent2D]> | null = null
  private _pointerUp: Signal<[event: PointerEvent2D]> | null = null
  private _clicked: Signal<[event: PointerEvent2D]> | null = null
  /**
   * 是否接收指针事件。为 true 且点击区域命中时，节点会收到 pointerDown；
   * 按下之后同一指针的移动和抬起都发给这个节点（即使移出了区域），抬起时仍在区域内则触发 clicked。
   * 多个节点重叠时只有最上层（绘制顺序最后）的节点收到事件。
   */
  inputPickable: boolean
  /** 点击区域（局部坐标）。不设置时，Sprite2D 用贴图范围，其他节点无法被点中。 */
  hitArea: Rect2 | CircleHitArea | null
  /** @internal position / rotation / scale 变化时递增，渲染同步据此只更新容器的变换。 */
  _transformVersion = 0
  /** @internal 变换以外的显示状态（可见性、zIndex、颜色、贴图、文字……）变化时递增。 */
  _version = 0
  /** @internal 渲染层创建的显示对象；无头模式下始终为 null。 */
  _view: unknown = null

  constructor(options: Node2DOptions = {}) {
    super(options)
    const position = options.position ?? Vector2.ZERO
    this._x = position.x
    this._y = position.y
    this._positionCache = position
    this._rotation = options.rotation ?? 0
    this._scale = options.scale ?? Vector2.ONE
    this._visible = options.visible ?? true
    this._zIndex = options.zIndex ?? 0
    this._alpha = clampAlpha(options.alpha ?? 1)
    this._modulate = clampColor(options.modulate ?? WHITE)
    this._selfModulate = clampColor(options.selfModulate ?? WHITE)
    this.inputPickable = options.inputPickable ?? false
    this.hitArea = options.hitArea ?? null
  }

  get position(): Vector2 {
    return (this._positionCache ??= new Vector2(this._x, this._y))
  }

  set position(value: Vector2) {
    this._x = value.x
    this._y = value.y
    this._positionCache = value // Vector2 不可变，可以直接缓存
    this._transformVersion++
    this._transformChanged()
  }

  get x(): number {
    return this._x
  }

  set x(value: number) {
    this._x = value
    this._positionCache = null
    this._transformVersion++
    this._transformChanged()
  }

  get y(): number {
    return this._y
  }

  set y(value: number) {
    this._y = value
    this._positionCache = null
    this._transformVersion++
    this._transformChanged()
  }

  /** 弧度。 */
  get rotation(): number {
    return this._rotation
  }

  set rotation(value: number) {
    this._rotation = value
    this._transformVersion++
    this._transformChanged()
  }

  get rotationDegrees(): number {
    return (this._rotation * 180) / Math.PI
  }

  set rotationDegrees(value: number) {
    this.rotation = (value * Math.PI) / 180
  }

  get scale(): Vector2 {
    return this._scale
  }

  set scale(value: Vector2) {
    this._scale = value
    this._transformVersion++
    this._transformChanged()
  }

  get visible(): boolean {
    return this._visible
  }

  set visible(value: boolean) {
    this._visible = value
    this._version++
  }

  /** 同一父节点下的绘制顺序，数值大的画在上面。 */
  get zIndex(): number {
    return this._zIndex
  }

  set zIndex(value: number) {
    this._zIndex = value
    this._version++
  }

  /**
   * 不透明度 0–1（超出范围会被截断），作用于自己和所有子节点：父 0.5、子 0.5 时子节点实际为 0.25。
   * 为 0 时节点仍然可以被点中；要隐藏请用 `visible`。
   */
  get alpha(): number {
    return this._alpha
  }

  set alpha(value: number) {
    this._alpha = clampAlpha(value)
    this._version++
  }

  /**
   * 颜色乘子（0xRRGGBB）：每个像素的颜色与它相乘，作用于自己和所有子节点。
   * 默认 0xffffff 不改变颜色；0xff6666 偏红，0x888888 变暗。只能变暗或偏色，不能变亮。
   * 补间时按 RGB 通道分别插值。
   */
  get modulate(): number {
    return this._modulate
  }

  set modulate(value: number) {
    this._modulate = clampColor(value)
    this._version++
  }

  /**
   * 只作用于自己内容（Sprite2D 的贴图、Label 的文字）的颜色乘子，不影响子节点；与 `modulate` 叠乘。
   * 普通 Node2D 自己不绘制内容，设置它没有可见效果。补间时按 RGB 通道分别插值。
   */
  get selfModulate(): number {
    return this._selfModulate
  }

  set selfModulate(value: number) {
    this._selfModulate = clampColor(value)
    this._version++
  }

  /** @internal 值是颜色（0xRRGGBB）的属性；Tween 对它们按 RGB 通道插值。 */
  get _colorProps(): ReadonlySet<string> {
    return COLOR_PROPS
  }

  /** @internal position / rotation / scale 被赋值后调用。物理节点据此发现“用户瞬移了刚体”。 */
  _transformChanged(): void {}

  // ---------------------------------------------------------------- 全局变换

  /** 局部变换：缩放 → 旋转 → 平移。 */
  get transform(): Transform2D {
    return Transform2D.fromParts(this.position, this._rotation, this._scale)
  }

  /**
   * 全局变换：世界坐标（没有相机时就是设计坐标）。非 Node2D 的祖先不参与变换；
   * 在 CanvasLayer 下面时只算到 CanvasLayer 为止，结果是设计坐标（屏幕上的位置）。
   */
  get globalTransform(): Transform2D {
    let t = this.transform
    for (let p = this._canvasParent; p; p = p._canvasParent) {
      if (p instanceof Node2D) t = p.transform.multiply(t)
    }
    return t
  }

  /** 全局旋转（弧度）。 */
  get globalRotation(): number {
    const t = this.globalTransform
    return Math.atan2(t.b, t.a)
  }

  /** 节点原点的全局位置（设计坐标）。 */
  get globalPosition(): Vector2 {
    return this.globalTransform.origin
  }

  /** 全局坐标 → 局部坐标。缩放为 0（变换不可逆）时返回 Vector2.ZERO；需要区分时用 `globalTransform.inverse()`。 */
  toLocal(globalPoint: Vector2): Vector2 {
    return this.globalTransform.inverse()?.apply(globalPoint) ?? Vector2.ZERO
  }

  /** 局部坐标 → 全局坐标。 */
  toGlobal(localPoint: Vector2): Vector2 {
    return this.globalTransform.apply(localPoint)
  }

  /**
   * 自己和所有 Node2D 祖先都可见。在 CanvasLayer 下面时：Node2D 祖先只看到 CanvasLayer 为止，
   * 并且这个 CanvasLayer 和包含它的 CanvasLayer 都要可见（CanvasLayer 外面的 Node2D 隐藏不影响它，和 Godot 一样）。
   */
  get isVisibleInTree(): boolean {
    for (let n: Node | null = this; n; n = n._canvasParent) {
      if (n instanceof Node2D && !n.visible) return false
    }
    for (let l = this._canvasLayer; l; l = l._canvasLayer) if (!l.visible) return false
    return true
  }

  // ---------------------------------------------------------------- 指针事件

  /** 指针在点击区域内按下。需要 `inputPickable = true`。 */
  get pointerDown(): Signal<[event: PointerEvent2D]> {
    return (this._pointerDown ??= new Signal())
  }

  /** 按下之后指针移动（拖拽）。 */
  get pointerMove(): Signal<[event: PointerEvent2D]> {
    return (this._pointerMove ??= new Signal())
  }

  /** 按下之后指针抬起（无论是否还在区域内）。 */
  get pointerUp(): Signal<[event: PointerEvent2D]> {
    return (this._pointerUp ??= new Signal())
  }

  /** 按下和抬起都在点击区域内。 */
  get clicked(): Signal<[event: PointerEvent2D]> {
    return (this._clicked ??= new Signal())
  }

  /** 局部坐标的点是否在点击区域内。子类可以覆写（Sprite2D 默认用贴图范围）。 */
  hitTest(localPoint: Vector2): boolean {
    const area = this.hitArea
    if (!area) return false
    if (area instanceof Rect2) return area.contains(localPoint)
    return localPoint.distanceTo(area.center ?? Vector2.ZERO) <= area.radius
  }

  /** @internal 销毁时一并断开指针信号（它们是惰性创建的私有字段，Node 的通用清理看不到）。 */
  override _onFreed(): void {
    for (const s of [this._pointerDown, this._pointerMove, this._pointerUp, this._clicked]) s?.disconnectAll()
  }

  /**
   * 逃生口：渲染层为这个节点创建的 Pixi 显示对象（一个 Container）。无头模式、或节点还没被渲染过时为 null。
   * 直接修改它会绕过引擎，且下一帧可能被同步覆盖；只在引擎没有提供对应能力时使用。
   */
  get unsafePixi(): unknown {
    return this._view
  }

  protected override dumpProps(): Record<string, unknown> {
    return {
      position: this.position,
      rotationDegrees: this._rotation !== 0 ? Math.round(this.rotationDegrees * 100) / 100 : undefined,
      scale: this._scale.equals(Vector2.ONE) ? undefined : this._scale,
      visible: this._visible ? undefined : false,
      zIndex: this._zIndex !== 0 ? this._zIndex : undefined,
      alpha: this._alpha !== 1 ? Math.round(this._alpha * 100) / 100 : undefined,
      modulate: this._modulate !== WHITE ? hex(this._modulate) : undefined,
      selfModulate: this._selfModulate !== WHITE ? hex(this._selfModulate) : undefined,
    }
  }
}

const WHITE = 0xffffff
const COLOR_PROPS: ReadonlySet<string> = new Set(['modulate', 'selfModulate'])

function clampAlpha(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function clampColor(value: number): number {
  return Math.min(WHITE, Math.max(0, Math.round(value)))
}

function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0')
}
