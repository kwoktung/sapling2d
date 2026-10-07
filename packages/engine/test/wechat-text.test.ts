import { describe, expect, it } from 'vitest'
import { _completeTextMetrics } from '../src/platform/wechat/textMetrics'

/** 模拟一个 2D 上下文：measureText 返回给定的字段 */
function fakeContext(fields: (font: string) => Record<string, number>) {
  return { font: '10px sans-serif', measureText(_text: string): unknown { return fields(this.font) } }
}

describe('真机 measureText 补齐', () => {
  it('真机（只有 width 和 fontBoundingBox*）：用 fontBoundingBox 补 actualBoundingBox*', () => {
    const ctx = fakeContext(() => ({ width: 104.9, fontBoundingBoxAscent: 25, fontBoundingBoxDescent: 7 })) // iOS 实测（32px）
    _completeTextMetrics(ctx)
    ctx.font = '32px sans-serif'
    expect(ctx.measureText('Hg中文')).toEqual({
      width: 104.9,
      fontBoundingBoxAscent: 25,
      fontBoundingBoxDescent: 7,
      actualBoundingBoxAscent: 25,
      actualBoundingBoxDescent: 7,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: 104.9,
    })
  })

  it('连 fontBoundingBox 都没有时，按字号估算（约 0.82 / 0.22）', () => {
    const ctx = fakeContext(() => ({ width: 50 }))
    _completeTextMetrics(ctx)
    ctx.font = 'bold 40px "PingFang SC"'
    const m = ctx.measureText('x') as Record<string, number>
    expect(m.actualBoundingBoxAscent).toBeCloseTo(32.8)
    expect(m.actualBoundingBoxDescent).toBeCloseTo(8.8)
    // 行高（Pixi 用 ascent + descent）不再是 0
    expect(m.actualBoundingBoxAscent! + m.actualBoundingBoxDescent!).toBeGreaterThan(40)
  })

  it('已经有 actualBoundingBox*（模拟器、浏览器）时原样返回；重复补丁无副作用', () => {
    const native = { width: 104.9, actualBoundingBoxAscent: 26.37, actualBoundingBoxDescent: 7.08, actualBoundingBoxLeft: -2.5, actualBoundingBoxRight: 103.5 }
    const ctx = fakeContext(() => native)
    _completeTextMetrics(ctx)
    _completeTextMetrics(ctx)
    expect(ctx.measureText('Hg中文')).toBe(native)
  })
})
