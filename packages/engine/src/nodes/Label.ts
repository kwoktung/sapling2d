import { Node2D, type Node2DOptions } from '../core/Node2D'

export type HorizontalAlignment = 'left' | 'center' | 'right'
export type VerticalAlignment = 'top' | 'center' | 'bottom'

export interface LabelStroke {
  /** 描边颜色，0xRRGGBB。 */
  color: number
  /** 描边宽度（像素）。 */
  width: number
}

export interface LabelOptions extends Node2DOptions {
  text?: string
  /** 字号（设计像素），默认 32。 */
  fontSize?: number
  /** 文字颜色，0xRRGGBB，默认白色。 */
  color?: number
  /** 字体，默认 'sans-serif'。小游戏里自定义字体需先加载。 */
  fontFamily?: string
  fontWeight?: 'normal' | 'bold'
  /** 文字相对 position 的水平对齐，默认 'left'（position 是文字左边）。多行时也决定行内对齐。 */
  align?: HorizontalAlignment
  /** 文字相对 position 的垂直对齐，默认 'top'（position 是文字上边）。 */
  verticalAlign?: VerticalAlignment
  stroke?: LabelStroke | null
  /** 超过这个宽度（设计像素）自动换行；不设置则只在 \n 处换行。 */
  wrapWidth?: number | null
  /** 行高（设计像素）；不设置则由字体决定。 */
  lineHeight?: number | null
}

/**
 * 显示一段文字。
 *
 * ```ts
 * this.score = this.add(new Label({ text: '0', fontSize: 48, align: 'center', position: v(375, 120) }))
 * this.score.text = String(points)
 * ```
 *
 * 注意：真机上的字间距（letterSpacing）不保证生效，没有提供；见 spikes/wechat/REPORT.md。
 */
export class Label extends Node2D {
  private _text: string
  private _fontSize: number
  private _color: number
  private _fontFamily: string
  private _fontWeight: 'normal' | 'bold'
  private _align: HorizontalAlignment
  private _verticalAlign: VerticalAlignment
  private _stroke: LabelStroke | null
  private _wrapWidth: number | null
  private _lineHeight: number | null

  constructor(options: LabelOptions = {}) {
    super(options)
    this._text = options.text ?? ''
    this._fontSize = options.fontSize ?? 32
    this._color = options.color ?? 0xffffff
    this._fontFamily = options.fontFamily ?? 'sans-serif'
    this._fontWeight = options.fontWeight ?? 'normal'
    this._align = options.align ?? 'left'
    this._verticalAlign = options.verticalAlign ?? 'top'
    this._stroke = options.stroke ?? null
    this._wrapWidth = options.wrapWidth ?? null
    this._lineHeight = options.lineHeight ?? null
  }

  get text(): string {
    return this._text
  }

  set text(value: string) {
    if (value === this._text) return
    this._text = value
    this._version++
  }

  get fontSize(): number {
    return this._fontSize
  }

  set fontSize(value: number) {
    this._fontSize = value
    this._version++
  }

  get color(): number {
    return this._color
  }

  set color(value: number) {
    this._color = value
    this._version++
  }

  get fontFamily(): string {
    return this._fontFamily
  }

  set fontFamily(value: string) {
    this._fontFamily = value
    this._version++
  }

  get fontWeight(): 'normal' | 'bold' {
    return this._fontWeight
  }

  set fontWeight(value: 'normal' | 'bold') {
    this._fontWeight = value
    this._version++
  }

  get align(): HorizontalAlignment {
    return this._align
  }

  set align(value: HorizontalAlignment) {
    this._align = value
    this._version++
  }

  get verticalAlign(): VerticalAlignment {
    return this._verticalAlign
  }

  set verticalAlign(value: VerticalAlignment) {
    this._verticalAlign = value
    this._version++
  }

  get stroke(): LabelStroke | null {
    return this._stroke
  }

  set stroke(value: LabelStroke | null) {
    this._stroke = value
    this._version++
  }

  get wrapWidth(): number | null {
    return this._wrapWidth
  }

  set wrapWidth(value: number | null) {
    this._wrapWidth = value
    this._version++
  }

  get lineHeight(): number | null {
    return this._lineHeight
  }

  set lineHeight(value: number | null) {
    this._lineHeight = value
    this._version++
  }

  protected override dumpProps(): Record<string, unknown> {
    return {
      ...super.dumpProps(),
      text: this._text,
      fontSize: this._fontSize !== 32 ? this._fontSize : undefined,
      align: this._align !== 'left' ? this._align : undefined,
    }
  }
}
