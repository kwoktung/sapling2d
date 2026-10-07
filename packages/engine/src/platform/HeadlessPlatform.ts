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
  #screen: ScreenInfo
  #screenListeners = new Set<(screen: ScreenInfo) => void>()
  #inputListeners = new Set<(event: RawInputEvent) => void>()
  #focusListeners = new Set<(focused: boolean) => void>()
  #time = 0
  #nextId = 1
  #pending = new Map<number, (timeMs: number) => void>()

  /** 不传 screen 时，屏幕默认是 750×1334、DPR 为 1。 */
  constructor(screen: ScreenInfo = { width: 750, height: 1334, pixelRatio: 1 }) {
    this.#screen = screen
  }

  getScreenInfo(): ScreenInfo {
    return this.#screen
  }

  onScreenChange(callback: (screen: ScreenInfo) => void): () => void {
    this.#screenListeners.add(callback)
    return () => this.#screenListeners.delete(callback)
  }

  onInput(callback: (event: RawInputEvent) => void): () => void {
    this.#inputListeners.add(callback)
    return () => this.#inputListeners.delete(callback)
  }

  /** 注入一个原始输入事件（窗口坐标）。它会在下一帧开始时被处理。 */
  injectInput(event: RawInputEvent): void {
    for (const cb of [...this.#inputListeners]) cb(event)
  }

  onFocusChange(callback: (focused: boolean) => void): () => void {
    this.#focusListeners.add(callback)
    return () => this.#focusListeners.delete(callback)
  }

  /** 模拟切到后台（false）/ 回到前台（true）。 */
  setFocus(focused: boolean): void {
    for (const cb of [...this.#focusListeners]) cb(focused)
  }

  /** 模拟屏幕变化（旋转、窗口缩放等）。 */
  setScreen(screen: ScreenInfo): void {
    this.#screen = screen
    for (const cb of [...this.#screenListeners]) cb(screen)
  }

  now(): number {
    return this.#time
  }

  requestFrame(callback: (timeMs: number) => void): number {
    const id = this.#nextId++
    this.#pending.set(id, callback)
    return id
  }

  cancelFrame(id: number): void {
    this.#pending.delete(id)
  }

  /** 无头模式不读取文件：图片立即“加载完成”，宽高为 0。 */
  loadImage(_path: string): Promise<LoadedImage> {
    return Promise.resolve({ resource: null, width: 0, height: 0 })
  }

  /** 推进时钟，并触发当前已注册的帧回调。 */
  advance(ms: number): void {
    this.#time += ms
    const callbacks = [...this.#pending.values()]
    this.#pending.clear()
    for (const cb of callbacks) cb(this.#time)
  }
}
