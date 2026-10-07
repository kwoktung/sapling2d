import type { Adapter } from 'pixi.js'
import { report } from './polyfills'

declare const wx: any

// 用一个离屏 canvas 探测 2D 上下文的原型（pixi 用它检查是否支持 letterSpacing）
const probe2d = wx.createCanvas().getContext('2d')

/**
 * pixi 用 `gl instanceof getWebGLRenderingContext()` 区分 WebGL1 和 WebGL2，判断不成立就当作 WebGL2。
 * 实测：开发者工具里虽然有全局 WebGLRenderingContext，但 wx 返回的 GL 上下文是包装对象，instanceof 不成立，
 * 导致 pixi 误判为 WebGL2、走 9 参数的 texImage2D 后崩溃。所以一律按 API 特征判断：WebGL1 上下文没有 createVertexArray。
 */
const WebGL1Like: any = {
  [Symbol.hasInstance]: (gl: any) => !!gl && typeof gl.getParameter === 'function' && typeof gl.createVertexArray !== 'function',
}
report.patched.push('WebGLRenderingContext (Symbol.hasInstance, always)')

function isRemote(url: string) {
  return /^https?:\/\//.test(url)
}

/** 最小的 Response shim：pixi 只会用 ok、status、json、text、arrayBuffer、blob */
function makeResponse(status: number, body: ArrayBuffer | string): Response {
  const text = () => (typeof body === 'string' ? body : utf8Decode(body))
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(text()),
    text: async () => text(),
    arrayBuffer: async () => (typeof body === 'string' ? utf8Encode(body) : body),
    blob: async () => {
      throw new Error('[wechat-adapter] Blob is not supported')
    },
  } as unknown as Response
}

function utf8Decode(buf: ArrayBuffer): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(buf)
  // TextDecoder 在真机上可能不存在
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
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
    return c
  },
  createImage: () => wx.createImage(),
  getCanvasRenderingContext2D: () => ({ prototype: Object.getPrototypeOf(probe2d) }) as any,
  getWebGLRenderingContext: () => WebGL1Like,
  getNavigator: () => ({ userAgent: 'wechatgame', gpu: null }),
  getBaseUrl: () => '',
  getFontFaceSet: () => null,
  fetch: (url: RequestInfo | URL) => {
    const path = String(url)
    return new Promise<Response>((resolve, reject) => {
      if (isRemote(path)) {
        wx.request({
          url: path,
          responseType: 'arraybuffer',
          success: (res: any) => resolve(makeResponse(res.statusCode, res.data)),
          fail: (err: any) => reject(new Error(err.errMsg)),
        })
      } else {
        wx.getFileSystemManager().readFile({
          filePath: path.replace(/^\.?\//, ''),
          success: (res: any) => resolve(makeResponse(200, res.data)),
          fail: (err: any) => reject(new Error(err.errMsg)),
        })
      }
    })
  },
  parseXML: () => {
    throw new Error('[wechat-adapter] parseXML is not supported')
  },
}
