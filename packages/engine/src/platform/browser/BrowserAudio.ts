import type { AudioBackend, SoundHandle } from '../../audio/backend'

/**
 * 浏览器音频：音效用 WebAudio（预解码的 AudioBuffer，可叠加），音乐用 HTMLAudioElement（流式）。
 *
 * 自动播放限制：浏览器要求先有用户手势才能发声。这里在第一次 pointerdown / keydown / touchend 时
 * 恢复 AudioContext 并开始排队中的音乐；解锁前请求的音效直接丢弃（视为已结束）。
 */
export class BrowserAudioBackend implements AudioBackend {
  private readonly _baseUrl: string
  private readonly _ctx: AudioContext
  private readonly _master: GainNode
  private _unlocked = false
  private _suspended = false
  /** 正在播放（或等待解锁后播放）的音乐元素。 */
  private readonly _music = new Set<HTMLAudioElement>()

  constructor(assetsBaseUrl: string) {
    this._baseUrl = assetsBaseUrl
    this._ctx = new AudioContext()
    this._master = this._ctx.createGain()
    this._master.connect(this._ctx.destination)
    this._unlocked = this._ctx.state === 'running'
    if (!this._unlocked) {
      // 每次手势都尝试 resume；确认进入 running 之后才移除监听。resume 被拒绝或没有生效时，下一次手势会重试
      const unlock = () => {
        this._ctx.resume().then(
          () => {
            if (this._ctx.state !== 'running' || this._unlocked) return
            this._unlocked = true
            for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true)
            if (!this._suspended) for (const el of this._music) void el.play().catch(() => {})
          },
          () => {},
        )
      }
      for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, true)
    }
  }

  /** 是否已经通过用户手势解锁。 */
  get unlocked(): boolean {
    return this._unlocked
  }

  async loadSound(path: string): Promise<unknown> {
    const res = await fetch(this._baseUrl + path)
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${res.url}`)
    return this._ctx.decodeAudioData(await res.arrayBuffer())
  }

  playSound(buffer: unknown, options: { volume: number; loop: boolean }): SoundHandle {
    if (!this._unlocked || this._suspended) return endedHandle()
    const source = this._ctx.createBufferSource()
    source.buffer = buffer as AudioBuffer
    source.loop = options.loop
    const gain = this._ctx.createGain()
    gain.gain.value = options.volume
    source.connect(gain).connect(this._master)
    let ended: (() => void) | null = null
    let stopped = false
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
      if (!stopped) ended?.()
    }
    source.start()
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
    const el = new Audio(this._baseUrl + path)
    el.loop = options.loop
    el.volume = options.volume
    this._music.add(el)
    let ended: (() => void) | null = null
    el.addEventListener('ended', () => {
      this._music.delete(el)
      ended?.()
    })
    if (this._unlocked && !this._suspended) void el.play().catch(() => {}) // 被拒绝时保持排队，解锁后重试
    return {
      setVolume: (v) => (el.volume = v),
      stop: () => {
        el.pause()
        el.removeAttribute('src')
        el.load()
        this._music.delete(el)
      },
      onEnded: (cb) => (ended = cb),
    }
  }

  suspend(): void {
    this._suspended = true
    void this._ctx.suspend()
    for (const el of this._music) el.pause()
  }

  resume(): void {
    this._suspended = false
    if (!this._unlocked) return
    void this._ctx.resume()
    for (const el of this._music) void el.play().catch(() => {})
  }
}

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const

/** 解锁前的音效：立即视为结束。 */
function endedHandle(): SoundHandle {
  return {
    setVolume: () => {},
    stop: () => {},
    onEnded: (cb) => queueMicrotask(cb),
  }
}
