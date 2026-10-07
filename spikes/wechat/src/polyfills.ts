// 必须是第一个被 import 的模块：pixi 在模块加载阶段就会读取部分全局变量。
declare const wx: any
declare const GameGlobal: any

const g: any = typeof globalThis !== 'undefined' ? globalThis : GameGlobal
if (typeof globalThis === 'undefined') GameGlobal.globalThis = GameGlobal

/** spike 报告：记录原生环境里有什么、我们补了什么 */
export const report: Record<string, any> = {
  native: {
    globalThis: typeof globalThis !== 'undefined',
    window: typeof g.window,
    document: typeof g.document,
    navigator: typeof g.navigator,
    performance: typeof g.performance,
    requestAnimationFrame: typeof g.requestAnimationFrame,
    TextDecoder: typeof g.TextDecoder,
    WebGLRenderingContext: typeof g.WebGLRenderingContext,
    WebAssembly: typeof g.WebAssembly,
    WXWebAssembly: typeof g.WXWebAssembly,
    fetch: typeof g.fetch,
    Image: typeof g.Image,
    createImageBitmap: typeof g.createImageBitmap,
    Proxy: typeof g.Proxy,
    Intl: typeof g.Intl,
    SymbolHasInstance: typeof Symbol !== 'undefined' && !!Symbol.hasInstance,
  },
  patched: [] as string[],
}

// 第一次 wx.createCanvas() 得到的是上屏 canvas，必须在其他任何 createCanvas 之前调用。
export const screenCanvas: any = wx.createCanvas()
report.screenCanvas = {
  addEventListener: typeof screenCanvas.addEventListener,
  style: typeof screenCanvas.style,
  width: screenCanvas.width,
  height: screenCanvas.height,
}
// GlContextSystem 会不加判断地调用 canvas.addEventListener('webglcontextlost', ...)
if (typeof screenCanvas.addEventListener !== 'function') {
  screenCanvas.addEventListener = () => {}
  screenCanvas.removeEventListener = () => {}
  report.patched.push('screenCanvas.addEventListener')
}

// pixi v8 在 WebGL1 上下文上也调用 WebGL2 的 5 参数 bufferSubData(target, offset, data, srcOffset, length)。
// 浏览器会忽略多余参数；iOS 真机的 WeChat WebGL1 不会，结果 buffer 不再更新，画面冻结（实测）。
// 这里改写成标准的 3 参数调用。
const rawGetContext = screenCanvas.getContext.bind(screenCanvas)
screenCanvas.getContext = (type: string, attrs?: any) => {
  const ctx = rawGetContext(type, attrs)
  if (ctx && type === 'webgl' && !ctx.__bufferSubDataPatched) {
    const raw = ctx.bufferSubData.bind(ctx)
    ctx.bufferSubData = (target: number, offset: number, data: any, srcOffset?: number, length?: number) => {
      if (srcOffset === undefined || !ArrayBuffer.isView(data)) return raw(target, offset, data)
      const view = data as unknown as { subarray(begin: number, end?: number): ArrayBufferView }
      return raw(target, offset, view.subarray(srcOffset, length === undefined ? undefined : srcOffset + length))
    }
    ctx.__bufferSubDataPatched = true
    report.patched.push('webgl1 bufferSubData (5-arg → 3-arg)')
  }
  return ctx
}

// performance.now()：wx.getPerformance().now() 据文档是微秒，main 里会再实测一次单位
const wxPerf = wx.getPerformance ? wx.getPerformance() : null
export const perfProbe = { wxStart: wxPerf ? wxPerf.now() : 0, dateStart: Date.now() }
if (typeof g.performance === 'undefined' || typeof g.performance.now !== 'function') {
  g.performance = { now: () => wxPerf.now() / 1000 }
  report.patched.push('performance (wx µs / 1000)')
}

// Android 微信没有全局 Intl；pixi 的 CanvasTextMetrics 在模块加载时执行 `typeof Intl?.Segmenter`，
// 而 `?.` 防不住未声明的变量，会直接抛 ReferenceError（实测）。补一个空对象，让 pixi 走 Array.from 的降级分支。
if (typeof g.Intl === 'undefined') {
  g.Intl = {}
  report.patched.push('Intl (empty object)')
}

if (typeof g.navigator === 'undefined') {
  g.navigator = { userAgent: 'wechatgame', gpu: null }
  report.patched.push('navigator')
}

if (typeof g.requestAnimationFrame !== 'function') {
  // 文档说全局有 rAF；没有的话退回 setTimeout，并记进报告
  g.requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(g.performance.now()), 16)
  g.cancelAnimationFrame = (id: any) => clearTimeout(id)
  report.patched.push('requestAnimationFrame (setTimeout fallback)')
}
