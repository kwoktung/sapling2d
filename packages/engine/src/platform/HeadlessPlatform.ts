import { HeadlessAudioBackend } from '../audio/HeadlessAudio'
import type { RawInputEvent } from '../core/Input'
import { MemoryStorageBackend } from '../storage/backend'
import type { ScreenInfo } from '../core/Viewport'
import type { LoadedImage, Platform } from './Platform'

/**
 * 无头平台：不渲染，时间完全由调用方推进。用于测试和 Node 环境。
 * `requestFrame` 注册的回调只在 `advance()` 时触发。
 */
export class HeadlessPlatform implements Platform {
  /** 不发声、只记录的音频；测试里用 `log` 断言播放了什么。 */
  readonly audio = new HeadlessAudioBackend()
  /** 内存存储：每个测试游戏独立。 */
  readonly storage = new MemoryStorageBackend()
  private _screen: ScreenInfo
  private _screenListeners = new Set<(screen: ScreenInfo) => void>()
  private _inputListeners = new Set<(event: RawInputEvent) => void>()
  private _focusListeners = new Set<(focused: boolean) => void>()
  private _time = 0
  private _nextId = 1
  private _pending = new Map<number, (timeMs: number) => void>()

  private readonly _readText: ((path: string) => Promise<string>) | null

  /**
   * 不传 screen 时，屏幕默认是 750×1334、DPR 为 1。
   * `readText`：读取资源目录里的文本文件（关卡 JSON 等）；`createTestGame` 用 Node 的文件系统提供。不传时读取会失败。
   */
  constructor(screen: ScreenInfo = { width: 750, height: 1334, pixelRatio: 1 }, readText?: (path: string) => Promise<string>) {
    this._screen = screen
    this._readText = readText ?? null
  }

  loadText(path: string): Promise<string> {
    if (!this._readText) return Promise.reject(new Error(`cannot load text "${path}": this HeadlessPlatform has no file access (pass readText)`))
    return this._readText(path)
  }

  getScreenInfo(): ScreenInfo {
    return this._screen
  }

  onScreenChange(callback: (screen: ScreenInfo) => void): () => void {
    this._screenListeners.add(callback)
    return () => this._screenListeners.delete(callback)
  }

  onInput(callback: (event: RawInputEvent) => void): () => void {
    this._inputListeners.add(callback)
    return () => this._inputListeners.delete(callback)
  }

  /** 注入一个原始输入事件（窗口坐标）。它会在下一帧开始时被处理。 */
  injectInput(event: RawInputEvent): void {
    for (const cb of [...this._inputListeners]) cb(event)
  }

  onFocusChange(callback: (focused: boolean) => void): () => void {
    this._focusListeners.add(callback)
    return () => this._focusListeners.delete(callback)
  }

  /** 模拟切到后台（false）/ 回到前台（true）。 */
  setFocus(focused: boolean): void {
    for (const cb of [...this._focusListeners]) cb(focused)
  }

  /** 模拟屏幕变化（旋转、窗口缩放等）。 */
  setScreen(screen: ScreenInfo): void {
    this._screen = screen
    for (const cb of [...this._screenListeners]) cb(screen)
  }

  now(): number {
    return this._time
  }

  requestFrame(callback: (timeMs: number) => void): number {
    const id = this._nextId++
    this._pending.set(id, callback)
    return id
  }

  cancelFrame(id: number): void {
    this._pending.delete(id)
  }

  /** 无头模式不读取文件：图片立即“加载完成”，宽高为 0。 */
  loadImage(_path: string): Promise<LoadedImage> {
    return Promise.resolve({ resource: null, width: 0, height: 0 })
  }

  /** 推进时钟，并触发当前已注册的帧回调。 */
  advance(ms: number): void {
    this._time += ms
    const callbacks = [...this._pending.values()]
    this._pending.clear()
    for (const cb of callbacks) cb(this._time)
  }
}
