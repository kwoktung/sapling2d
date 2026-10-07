/// <reference path="./wx.d.ts" />
/**
 * 微信小游戏的运行环境补丁。必须在 Pixi 的任何模块加载之前执行：Pixi 在模块加载阶段就会读取部分全局对象。
 * `sapling2d/wechat` 的入口第一行就导入本模块。
 *
 * 每一项都来自真机实测，详见 spikes/wechat/REPORT.md 第 2 节。
 */
import { _createClock } from './clock'

const g = (typeof globalThis !== 'undefined' ? globalThis : GameGlobal) as Record<string, unknown>

/**
 * 上屏 canvas：第一次 wx.createCanvas() 得到的才是屏幕，之后的都是离屏 canvas。
 * 所以必须在其他任何 createCanvas 之前创建。
 */
export const screenCanvas = wx.createCanvas()

// Pixi 的 GlContextSystem 不加判断就调用 canvas.addEventListener('webglcontextlost', ...)；真机的 canvas 没有这个方法
if (typeof screenCanvas.addEventListener !== 'function') {
  screenCanvas.addEventListener = () => {}
  screenCanvas.removeEventListener = () => {}
}

// Pixi v8 在 WebGL1 上也调用 WebGL2 的 5 参数 bufferSubData(target, offset, data, srcOffset, length)。
// 浏览器会忽略多余参数；iOS 真机不会，结果 buffer 不再更新，画面约 1 秒后冻结。这里改写成 3 参数调用。
const rawGetContext = screenCanvas.getContext.bind(screenCanvas)
screenCanvas.getContext = (type: string, attrs?: object) => {
  const ctx = rawGetContext(type, attrs)
  if (ctx && type === 'webgl' && !ctx.__saplingPatched) {
    const raw = ctx.bufferSubData.bind(ctx) as (target: number, offset: number, data: unknown) => void
    ctx.bufferSubData = (target: number, offset: number, data: { subarray?(b: number, e?: number): unknown }, srcOffset?: number, length?: number) => {
      if (srcOffset === undefined || typeof data?.subarray !== 'function') return raw(target, offset, data)
      return raw(target, offset, data.subarray(srcOffset, length === undefined ? undefined : srcOffset + length))
    }
    ctx.__saplingPatched = true
  }
  return ctx
}

// Android 没有全局 Intl；Pixi 的 CanvasTextMetrics 在加载时执行 `typeof Intl?.Segmenter`，`?.` 防不住未声明的变量
if (typeof g.Intl === 'undefined') g.Intl = {}

// Pixi 在加载时读取 navigator（isMobile）；真机没有
if (typeof g.navigator === 'undefined') g.navigator = { userAgent: 'wechatgame', gpu: null }

// 真机没有全局 performance；wx.getPerformance().now() 的单位在真机和模拟器上不同，统一换算成毫秒
if (typeof g.performance === 'undefined' || typeof (g.performance as { now?: unknown }).now !== 'function') {
  const now = _createClock(wx.getPerformance(), () => Date.now())
  g.performance = { now }
}
