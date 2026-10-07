/**
 * 真机（iOS、Android）的 `measureText` 不返回 `actualBoundingBox*`，只有 width 和 `fontBoundingBox*`（实测，见
 * spikes/wechat/REPORT.md）。Pixi 用 `actualBoundingBoxAscent + Descent` 计算字体高度（也就是行高）和文字宽度，
 * 缺失时被当成 0：多行文字会叠在一起。这里给 2D 上下文补齐这些字段。
 */

interface MeasurableContext {
  font: string
  measureText(text: string): unknown
  __saplingMetricsPatched?: boolean
}

/** 字体高度的经验比例：模拟器里 32px 'Hg中文' 的 actualBoundingBoxAscent / Descent 约为 26.4 / 7.1。 */
const ASCENT_RATIO = 0.82
const DESCENT_RATIO = 0.22

/** @internal 给一个 2D 上下文补齐 measureText 的返回值（只在缺字段时生效；可重复调用）。 */
export function _completeTextMetrics(ctx: MeasurableContext): void {
  if (ctx.__saplingMetricsPatched) return
  ctx.__saplingMetricsPatched = true
  const raw = ctx.measureText.bind(ctx)
  ctx.measureText = (text: string) => {
    const m = raw(text) as Record<string, number | undefined>
    if (typeof m.actualBoundingBoxAscent === 'number') return m
    const size = fontSize(ctx.font)
    const width = m.width ?? 0
    return {
      width,
      fontBoundingBoxAscent: m.fontBoundingBoxAscent,
      fontBoundingBoxDescent: m.fontBoundingBoxDescent,
      actualBoundingBoxAscent: m.fontBoundingBoxAscent ?? size * ASCENT_RATIO,
      actualBoundingBoxDescent: m.fontBoundingBoxDescent ?? size * DESCENT_RATIO,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: width,
    }
  }
}

/** 从 CSS font 字符串（如 'bold 32px sans-serif'）里取出字号，取不到时按 10px（canvas 默认）。 */
function fontSize(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font)
  return m ? Number(m[1]) : 10
}
