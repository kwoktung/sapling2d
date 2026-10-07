/// <reference path="./wx.d.ts" />
import type { Adapter } from 'pixi.js'
import { _completeTextMetrics } from './textMetrics'

/**
 * Pixi v8 的 DOMAdapter（9 个方法）在微信小游戏里的实现。见 spikes/wechat/REPORT.md。
 */

// 用一个离屏 canvas 拿到 2D 上下文的原型（Pixi 用它检查是否支持 letterSpacing）
let probe2d: object | null = null
function context2dPrototype(): object {
  probe2d ??= wx.createCanvas().getContext('2d') as object
  return Object.getPrototypeOf(probe2d) as object
}

/**
 * Pixi 用 `gl instanceof getWebGLRenderingContext()` 区分 WebGL1 / WebGL2，判断不成立就当作 WebGL2。
 * wx 返回的 GL 上下文是包装对象，即使有全局 WebGLRenderingContext（模拟器）instanceof 也不成立，
 * 会导致 Pixi 走 WebGL2 的 9 参数 texImage2D 而崩溃。所以一律按 API 特征判断：WebGL1 没有 createVertexArray。
 */
const WebGL1Like = {
  [Symbol.hasInstance]: (gl: unknown) =>
    !!gl && typeof (gl as { getParameter?: unknown }).getParameter === 'function' && typeof (gl as { createVertexArray?: unknown }).createVertexArray !== 'function',
}

function isRemote(url: string): boolean {
  return /^https?:\/\//.test(url)
}

/** fetch 的最小 Response：Pixi 只会用到 ok、status、json、text、arrayBuffer。 */
interface ResponseLike {
  ok: boolean
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
  arrayBuffer(): Promise<ArrayBuffer>
  blob(): Promise<never>
}

function makeResponse(status: number, body: ArrayBuffer | string): ResponseLike {
  const text = () => (typeof body === 'string' ? body : utf8Decode(body))
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(text()),
    text: async () => text(),
    arrayBuffer: async () => (typeof body === 'string' ? utf8Encode(body) : body),
    blob: async () => {
      throw new Error('[sapling2d] Blob is not supported on WeChat')
    },
  }
}

// 真机没有 TextDecoder / TextEncoder
function utf8Decode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return decodeURIComponent(escape(s))
}

function utf8Encode(s: string): ArrayBuffer {
  const bin = unescape(encodeURIComponent(s))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

export const WechatAdapter: Adapter = {
  createCanvas: (width?: number, height?: number) => {
    const c = wx.createCanvas()
    if (width !== undefined) c.width = width
    if (height !== undefined) c.height = height
    // 2D 上下文：补齐真机 measureText 缺失的 actualBoundingBox*（见 textMetrics.ts）
    const getContext = c.getContext.bind(c)
    c.getContext = (type: string, attrs?: object) => {
      const ctx = getContext(type, attrs)
      if (type === '2d' && ctx) _completeTextMetrics(ctx)
      return ctx
    }
    return c as never
  },
  createImage: () => wx.createImage() as never,
  getCanvasRenderingContext2D: () => ({ prototype: context2dPrototype() }) as never,
  getWebGLRenderingContext: () => WebGL1Like as never,
  getNavigator: () => ({ userAgent: 'wechatgame', gpu: null }),
  // 包内文件用相对于工程根目录的路径（不能以 ./ 开头）
  getBaseUrl: () => '',
  getFontFaceSet: () => null,
  fetch: ((url: unknown) => {
    const path = String(url)
    return new Promise<ResponseLike>((resolve, reject) => {
      if (isRemote(path)) {
        wx.request({
          url: path,
          responseType: 'arraybuffer',
          success: (res) => resolve(makeResponse(res.statusCode, res.data as ArrayBuffer)),
          fail: (err) => reject(new Error(err.errMsg)),
        })
      } else {
        wx.getFileSystemManager().readFile({
          filePath: path.replace(/^\.?\//, ''),
          success: (res) => resolve(makeResponse(200, res.data)),
          fail: (err) => reject(new Error(err.errMsg)),
        })
      }
    })
  }) as unknown as Adapter['fetch'],
  parseXML: () => {
    throw new Error('[sapling2d] parseXML is not supported on WeChat')
  },
}
