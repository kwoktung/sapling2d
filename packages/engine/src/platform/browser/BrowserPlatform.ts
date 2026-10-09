import type { RawInputEvent } from '../../core/Input'
import { MemoryStorageBackend, type StorageBackend } from '../../storage/backend'
import { BrowserAudioBackend } from './BrowserAudio'
import type { ScreenInfo } from '../../core/Viewport'
import type { LoadedImage, Platform } from '../Platform'

export interface BrowserPlatformOptions {
  canvas: HTMLCanvasElement
  /** 资源目录的 URL，默认 `assets/`（相对于页面）。 */
  assetsBaseUrl?: string
}

/** 浏览器平台：requestAnimationFrame 帧循环，HTMLImageElement 加载图片。 */
export class BrowserPlatform implements Platform {
  readonly canvas: HTMLCanvasElement
  readonly assetsBaseUrl: string
  readonly audio: BrowserAudioBackend
  readonly storage: StorageBackend

  constructor(options: BrowserPlatformOptions) {
    this.canvas = options.canvas
    const base = options.assetsBaseUrl ?? 'assets/'
    this.assetsBaseUrl = base.endsWith('/') ? base : `${base}/`
    this.audio = new BrowserAudioBackend(this.assetsBaseUrl)
    this.storage = createBrowserStorage()
  }

  now(): number {
    return performance.now()
  }

  requestFrame(callback: (timeMs: number) => void): number {
    return requestAnimationFrame(callback)
  }

  cancelFrame(id: number): void {
    cancelAnimationFrame(id)
  }

  /** 屏幕就是整个浏览器窗口；安全区来自 CSS 的 env(safe-area-inset-*)。 */
  getScreenInfo(): ScreenInfo {
    const width = window.innerWidth
    const height = window.innerHeight
    const inset = readSafeAreaInsets()
    return {
      width,
      height,
      pixelRatio: window.devicePixelRatio || 1,
      safeArea: { left: inset.left, top: inset.top, right: width - inset.right, bottom: height - inset.bottom },
    }
  }

  onScreenChange(callback: (screen: ScreenInfo) => void): () => void {
    const handler = () => callback(this.getScreenInfo())
    window.addEventListener('resize', handler)
    window.addEventListener('orientationchange', handler)
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('orientationchange', handler)
    }
  }

  /**
   * 指针：在画布上按下，之后的移动和抬起在整个窗口上监听（拖出画布也不丢）。坐标相对于画布左上角。
   * 键盘：在窗口上监听，忽略按住不放的自动重复。不使用 Pixi 的事件系统（见 ADR 0001）。
   */
  onInput(callback: (event: RawInputEvent) => void): () => void {
    const canvas = this.canvas
    const pointer = (type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel') => (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      callback({ type, pointerId: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top })
    }
    const down = pointer('pointerdown')
    const onDown = (e: PointerEvent) => {
      e.preventDefault() // 避免选中文字、触发滚动
      down(e)
    }
    const onMove = pointer('pointermove')
    const onUp = pointer('pointerup')
    const onCancel = pointer('pointercancel')
    // 记住按住的键：窗口失焦（alt-tab、点到别的窗口）时 keyup 会发到别处，这里补发，避免按键“卡住”
    const held = new Set<string>()
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.type === 'keydown') held.add(e.code)
      else held.delete(e.code)
      callback({ type: e.type === 'keydown' ? 'keydown' : 'keyup', code: e.code })
    }
    const onBlur = () => {
      for (const code of held) callback({ type: 'keyup', code })
      held.clear()
    }
    const noMenu = (e: Event) => e.preventDefault()

    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onBlur)
    canvas.addEventListener('contextmenu', noMenu)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
      canvas.removeEventListener('contextmenu', noMenu)
    }
  }

  onFocusChange(callback: (focused: boolean) => void): () => void {
    const handler = () => callback(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }

  async loadText(path: string): Promise<string> {
    const url = this.assetsBaseUrl + path
    const res = await fetch(url)
    if (!res.ok) throw new Error(`cannot load ${url}: HTTP ${res.status}`)
    return res.text()
  }

  loadImage(path: string): Promise<LoadedImage> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve({ resource: img, width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error(`cannot load ${img.src}`))
      img.src = this.assetsBaseUrl + path
    })
  }
}

let probe: HTMLDivElement | null = null

/** 用一个不可见元素读取 env(safe-area-inset-*)（需要页面 viewport 设置 viewport-fit=cover 才非 0）。 */
function readSafeAreaInsets(): { left: number; top: number; right: number; bottom: number } {
  if (!probe) {
    probe = document.createElement('div')
    probe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
    document.body.appendChild(probe)
  }
  const cs = getComputedStyle(probe)
  return {
    left: parseFloat(cs.paddingLeft) || 0,
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
  }
}

/** localStorage；不可用时（隐私模式、被禁用、沙箱 iframe）退回内存存储。 */
function createBrowserStorage(): StorageBackend {
  try {
    const ls = window.localStorage
    const probe = '__sapling2d_probe__'
    ls.setItem(probe, '1')
    ls.removeItem(probe)
    return {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
      keys: () => Array.from({ length: ls.length }, (_, i) => ls.key(i)).filter((k): k is string => k !== null),
    }
  } catch {
    console.warn('localStorage is not available; saves will only last for this session.')
    return new MemoryStorageBackend()
  }
}
