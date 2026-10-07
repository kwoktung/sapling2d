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
  #text: string
  #fontSize: number
  #color: number
  #fontFamily: string
  #fontWeight: 'normal' | 'bold'
  #align: HorizontalAlignment
  #verticalAlign: VerticalAlignment
  #stroke: LabelStroke | null
  #wrapWidth: number | null
  #lineHeight: number | null

  constructor(options: LabelOptions = {}) {
    super(options)
    this.#text = options.text ?? ''
    this.#fontSize = options.fontSize ?? 32
    this.#color = options.color ?? 0xffffff
    this.#fontFamily = options.fontFamily ?? 'sans-serif'
    this.#fontWeight = options.fontWeight ?? 'normal'
    this.#align = options.align ?? 'left'
    this.#verticalAlign = options.verticalAlign ?? 'top'
    this.#stroke = options.stroke ?? null
    this.#wrapWidth = options.wrapWidth ?? null
    this.#lineHeight = options.lineHeight ?? null
  }

  get text(): string {
    return this.#text
  }

  set text(value: string) {
    if (value === this.#text) return
    this.#text = value
    this._version++
  }

  get fontSize(): number {
    return this.#fontSize
  }

  set fontSize(value: number) {
    this.#fontSize = value
    this._version++
  }

  get color(): number {
    return this.#color
  }

  set color(value: number) {
    this.#color = value
    this._version++
  }

  get fontFamily(): string {
    return this.#fontFamily
  }

  set fontFamily(value: string) {
    this.#fontFamily = value
    this._version++
  }

  get fontWeight(): 'normal' | 'bold' {
    return this.#fontWeight
  }

  set fontWeight(value: 'normal' | 'bold') {
    this.#fontWeight = value
    this._version++
  }

  get align(): HorizontalAlignment {
    return this.#align
  }

  set align(value: HorizontalAlignment) {
    this.#align = value
    this._version++
  }

  get verticalAlign(): VerticalAlignment {
    return this.#verticalAlign
  }

  set verticalAlign(value: VerticalAlignment) {
    this.#verticalAlign = value
    this._version++
  }

  get stroke(): LabelStroke | null {
    return this.#stroke
  }

  set stroke(value: LabelStroke | null) {
    this.#stroke = value
    this._version++
  }

  get wrapWidth(): number | null {
    return this.#wrapWidth
  }

  set wrapWidth(value: number | null) {
    this.#wrapWidth = value
    this._version++
  }

  get lineHeight(): number | null {
    return this.#lineHeight
  }

  set lineHeight(value: number | null) {
    this.#lineHeight = value
    this._version++
  }

  protected override dumpProps(): Record<string, unknown> {
    return {
      ...super.dumpProps(),
      text: this.#text,
      fontSize: this.#fontSize !== 32 ? this.#fontSize : undefined,
      align: this.#align !== 'left' ? this.#align : undefined,
    }
  }
}
