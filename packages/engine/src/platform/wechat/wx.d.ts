// 微信小游戏 API 的最小类型声明：只声明引擎用到的部分。
// 完整定义见 https://developers.weixin.qq.com/minigame/dev/api/

declare namespace WechatMiniGame {
  interface WindowInfo {
    pixelRatio: number
    windowWidth: number
    windowHeight: number
    screenWidth: number
    screenHeight: number
    safeArea?: { left: number; top: number; right: number; bottom: number; width: number; height: number }
  }

  interface Performance {
    /** 真机是微秒，开发者工具模拟器是毫秒（见 spikes/wechat/REPORT.md）。 */
    now(): number
  }

  interface Canvas {
    width: number
    height: number
    getContext(type: string, attrs?: object): any
    toDataURL(): string
    addEventListener?: (...args: unknown[]) => void
    removeEventListener?: (...args: unknown[]) => void
  }

  interface Image {
    src: string
    width: number
    height: number
    onload: (() => void) | null
    onerror: ((err: unknown) => void) | null
  }

  interface FileSystemManager {
    readFile(options: { filePath: string; encoding?: string; success?: (res: { data: ArrayBuffer | string }) => void; fail?: (err: { errMsg: string }) => void }): void
  }

  interface TouchEvent {
    touches: { identifier: number; clientX: number; clientY: number }[]
    changedTouches: { identifier: number; clientX: number; clientY: number }[]
    timeStamp: number
  }

  interface AudioBufferLike {
    duration: number
  }

  interface AudioNodeLike {
    connect(dest: unknown): unknown
    disconnect(): void
  }

  interface WebAudioContext {
    state: string
    destination: unknown
    resume(): unknown
    suspend(): unknown
    decodeAudioData(data: ArrayBuffer, success?: (buf: AudioBufferLike) => void, fail?: (err: unknown) => void): unknown
    createBufferSource(): AudioNodeLike & { buffer: AudioBufferLike | null; loop: boolean; onended: (() => void) | null; start(when?: number): void; stop(): void }
    createGain(): AudioNodeLike & { gain: { value: number } }
  }

  interface InnerAudioContext {
    src: string
    loop: boolean
    volume: number
    play(): void
    pause(): void
    stop(): void
    destroy(): void
    onEnded(cb: () => void): void
    onError(cb: (err: { errMsg: string; errCode?: number }) => void): void
  }

  interface Wx {
    createWebAudioContext(): WebAudioContext
    createInnerAudioContext(options?: { useWebAudioImplement?: boolean }): InnerAudioContext
    getStorageSync(key: string): unknown
    setStorageSync(key: string, value: unknown): void
    removeStorageSync(key: string): void
    getStorageInfoSync(): { keys: string[]; currentSize: number; limitSize: number }
    onShow(cb: () => void): void
    onHide(cb: () => void): void
    offShow?(cb: () => void): void
    offHide?(cb: () => void): void
    onTouchStart(cb: (e: TouchEvent) => void): void
    onTouchMove(cb: (e: TouchEvent) => void): void
    onTouchEnd(cb: (e: TouchEvent) => void): void
    onTouchCancel(cb: (e: TouchEvent) => void): void
    offTouchStart?(cb: (e: TouchEvent) => void): void
    offTouchMove?(cb: (e: TouchEvent) => void): void
    offTouchEnd?(cb: (e: TouchEvent) => void): void
    offTouchCancel?(cb: (e: TouchEvent) => void): void
    getPerformance(): Performance
    getWindowInfo?(): WindowInfo
    getSystemInfoSync(): WindowInfo
    onWindowResize(cb: (res: { windowWidth: number; windowHeight: number }) => void): void
    offWindowResize?(cb: (res: { windowWidth: number; windowHeight: number }) => void): void
    createCanvas(): Canvas
    createImage(): Image
    /** 加载字体文件，返回字体名；失败返回 null。 */
    loadFont(path: string): string | null
    getFileSystemManager(): FileSystemManager
    onError(cb: (err: { message: string; stack?: string }) => void): void
    request(options: {
      url: string
      method?: string
      data?: unknown
      responseType?: 'text' | 'arraybuffer'
      success?: (res: { statusCode: number; data: unknown }) => void
      fail?: (err: { errMsg: string }) => void
    }): void
  }
}

declare const wx: WechatMiniGame.Wx
declare const GameGlobal: Record<string, unknown>
declare function requestAnimationFrame(cb: (time: number) => void): number
declare function cancelAnimationFrame(id: number): void
