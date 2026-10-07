/// <reference path="./wx.d.ts" />
import type { AudioBackend, SoundHandle } from '../../audio/backend'

/** wx 音频 / 文件 / 触摸 API 中引擎用到的部分（作为参数传入，方便测试）。 */
export interface WxAudioApi {
  createWebAudioContext(): WechatMiniGame.WebAudioContext
  createInnerAudioContext(options?: { useWebAudioImplement?: boolean }): WechatMiniGame.InnerAudioContext
  getFileSystemManager(): WechatMiniGame.FileSystemManager
  onTouchStart(cb: () => void): void
  offTouchStart?(cb: () => void): void
}

/**
 * 微信小游戏音频：音效用 wx.createWebAudioContext（预解码，可叠加），音乐用 InnerAudioContext（流式）。
 *
 * 真机上 WebAudioContext 的初始状态是 'default'，要 resume() 之后才是 'running'（见 spikes/wechat/REPORT.md）。
 * 这里创建时就尝试 resume，第一次触摸时再试一次；未解锁时请求的音效直接丢弃（与浏览器一致）。
 * InnerAudioContext 用完必须 destroy（Android 同时最多约 10 个）。
 */
export class WechatAudioBackend implements AudioBackend {
  readonly #wx: WxAudioApi
  readonly #ctx: WechatMiniGame.WebAudioContext
  readonly #master: ReturnType<WechatMiniGame.WebAudioContext['createGain']>
  #suspended = false
  /** 正在播放的音乐 */
  readonly #music = new Set<WechatMiniGame.InnerAudioContext>()

  constructor(api: WxAudioApi) {
    this.#wx = api
    this.#ctx = api.createWebAudioContext()
    this.#master = this.#ctx.createGain()
    this.#master.connect(this.#ctx.destination)
    this.#tryResume()
    const onTouch = () => {
      this.#tryResume()
      if (this.unlocked) api.offTouchStart?.(onTouch)
    }
    api.onTouchStart(onTouch)
  }

  /** WebAudio 是否可以发声。 */
  get unlocked(): boolean {
    return this.#ctx.state === 'running'
  }

  loadSound(path: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.#wx.getFileSystemManager().readFile({
        filePath: `assets/${path}`,
        success: (res) => {
          // resolve / reject 只会生效一次，回调和 Promise 两种写法都接上也没问题
          const ok = (buf: unknown) => resolve(buf)
          const fail = (err: unknown) => reject(new Error(`decodeAudioData failed for ${path}: ${JSON.stringify(err)}`))
          // 文档是回调写法；部分版本同时返回 Promise
          const p = this.#ctx.decodeAudioData(res.data as ArrayBuffer, ok, fail) as { then?: (a: unknown, b: unknown) => void } | undefined
          if (p && typeof p.then === 'function') p.then(ok, fail)
        },
        fail: (err) => reject(new Error(`cannot read assets/${path}: ${err.errMsg}`)),
      })
    })
  }

  playSound(buffer: unknown, options: { volume: number; loop: boolean }): SoundHandle {
    if (!this.unlocked || this.#suspended) return endedHandle()
    const source = this.#ctx.createBufferSource()
    source.buffer = buffer as WechatMiniGame.AudioBufferLike
    source.loop = options.loop
    const gain = this.#ctx.createGain()
    gain.gain.value = options.volume
    source.connect(gain)
    gain.connect(this.#master)
    let ended: (() => void) | null = null
    let stopped = false
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
      if (!stopped) ended?.()
    }
    source.start(0)
    return {
      setVolume: (v) => (gain.gain.value = v),
      stop: () => {
        stopped = true
        try {
          source.stop()
        } catch {
          // 已经结束
        }
      },
      onEnded: (cb) => (ended = cb),
    }
  }

  playMusic(path: string, options: { volume: number; loop: boolean }): SoundHandle {
    const audio = this.#wx.createInnerAudioContext()
    audio.src = `assets/${path}`
    audio.loop = options.loop
    audio.volume = options.volume
    this.#music.add(audio)
    let ended: (() => void) | null = null
    const release = () => {
      if (!this.#music.delete(audio)) return
      audio.destroy()
    }
    audio.onEnded(() => {
      release()
      ended?.()
    })
    audio.onError((err) => console.warn(`[sapling2d] music "${path}" error: ${err.errMsg}`))
    if (!this.#suspended) audio.play()
    return {
      setVolume: (v) => (audio.volume = v),
      stop: () => {
        audio.stop()
        release()
      },
      onEnded: (cb) => (ended = cb),
    }
  }

  suspend(): void {
    this.#suspended = true
    void this.#ctx.suspend()
    for (const a of this.#music) a.pause()
  }

  resume(): void {
    this.#suspended = false
    this.#tryResume()
    for (const a of this.#music) a.play()
  }

  #tryResume(): void {
    try {
      const p = this.#ctx.resume() as { catch?: (f: () => void) => void } | undefined
      p?.catch?.(() => {})
    } catch {
      // 忽略：等下一次触摸
    }
  }
}

function endedHandle(): SoundHandle {
  return { setVolume: () => {}, stop: () => {}, onEnded: (cb) => void Promise.resolve().then(cb) }
}
