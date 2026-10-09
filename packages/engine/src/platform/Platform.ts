import type { AudioBackend } from '../audio/backend'
import type { RawInputEvent } from '../core/Input'
import type { StorageBackend } from '../storage/backend'
import type { ScreenInfo } from '../core/Viewport'

/** 平台加载出的图片：原始对象只由渲染层使用，核心代码只看宽高。 */
export interface LoadedImage {
  resource: unknown
  width: number
  height: number
}

/**
 * 引擎访问外部世界的唯一接口。核心代码不允许直接使用 window、document 或 wx，
 * 一律通过 Platform（见 CONTEXT.md）。
 */
export interface Platform {
  /** 平台的音频实现。 */
  readonly audio: AudioBackend
  /** 平台的键值存储。 */
  readonly storage: StorageBackend
  /** 单调递增的时间，单位毫秒。 */
  now(): number
  /** 在下一帧调用 callback，返回可用于取消的 id。 */
  requestFrame(callback: (timeMs: number) => void): number
  cancelFrame(id: number): void
  /** 加载一张图片。`path` 相对于游戏的资源目录。 */
  loadImage(path: string): Promise<LoadedImage>
  /** 读取一个文本文件（关卡 JSON 等）。`path` 相对于游戏的资源目录。 */
  loadText(path: string): Promise<string>
  /** 当前屏幕信息（窗口逻辑像素）。 */
  getScreenInfo(): ScreenInfo
  /** 屏幕尺寸、方向或 DPR 变化时回调。返回取消订阅的函数。 */
  onScreenChange(callback: (screen: ScreenInfo) => void): () => void
  /** 订阅原始输入事件（指针坐标为窗口逻辑像素）。返回取消订阅的函数。 */
  onInput(callback: (event: RawInputEvent) => void): () => void
  /** 游戏切到后台（false）或回到前台（true）。浏览器是 visibilitychange，小游戏是 wx.onHide / onShow。 */
  onFocusChange(callback: (focused: boolean) => void): () => void
}
