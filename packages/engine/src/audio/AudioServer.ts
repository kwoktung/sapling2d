import { Signal } from '../core/Signal'
import type { AudioStream } from './AudioStream'
import type { AudioBackend, SoundHandle } from './backend'

/** 音频总线。Music 和 SFX 都经过 Master：实际音量 = 声音音量 × 所在总线音量 × Master 音量。 */
export type AudioBus = 'Master' | 'Music' | 'SFX'

export interface PlayOptions {
  /** 音量 0–1，默认 1。 */
  volume?: number
  /** 循环播放，默认 false。 */
  loop?: boolean
  /** 所在总线；默认音效走 SFX，音乐走 Music。 */
  bus?: AudioBus
  /**
   * 同一个声音最多同时播放几个（对应 Godot 的 max_polyphony）。已经有这么多个在播时，这次不播：
   * 返回的 Voice 已经停止（`playing` 为 false），也不触发 finished。用于命中、爆炸这类一帧里可能触发几十次的音效。
   * 默认不限。
   */
  maxVoices?: number
}

/**
 * 一个正在播放（或等待加载后播放）的声音，由 `tree.audio.play()` 或 AudioStreamPlayer 创建。
 */
export class Voice {
  /** 自然播放结束时触发（循环播放和被 stop 时不触发）。 */
  readonly finished = new Signal()
  readonly stream: AudioStream
  readonly bus: AudioBus
  readonly loop: boolean
  private _volume: number
  private _playing = true
  /** @internal */
  _handle: SoundHandle | null = null
  private readonly _server: AudioServer

  /** @internal */
  constructor(server: AudioServer, stream: AudioStream, options: Required<Omit<PlayOptions, 'maxVoices'>>) {
    this._server = server
    this.stream = stream
    this.bus = options.bus
    this.loop = options.loop
    this._volume = options.volume
  }

  get playing(): boolean {
    return this._playing
  }

  get volume(): number {
    return this._volume
  }

  set volume(value: number) {
    this._volume = clamp01(value)
    this._handle?.setVolume(this._server._effectiveVolume(this))
  }

  stop(): void {
    if (!this._playing) return
    this._playing = false
    this._handle?.stop()
    this._handle = null
    this._server._forget(this)
  }

  /** @internal 超过 maxVoices 没有播放。 */
  _drop(): void {
    this._playing = false
  }

  /** @internal */
  _ended(): void {
    if (!this._playing) return
    this._playing = false
    this._handle = null
    this._server._forget(this)
    this.finished.emit()
  }
}

interface BusState {
  volume: number
  muted: boolean
}

/**
 * 音频系统，通过 `this.tree.audio` 访问。
 *
 * ```ts
 * class Main extends Scene {
 *   static assets = { pop: sfx('pop.mp3'), bgm: music('bgm.mp3') }
 *   override ready() {
 *     this.tree.audio.play(Main.assets.bgm, { loop: true })
 *     this.tree.audio.setBusVolume('Music', 0.5)
 *   }
 *   onMerge() {
 *     this.tree.audio.play(Main.assets.pop) // 一次性音效
 *   }
 * }
 * ```
 *
 * 浏览器要求先有一次用户交互才能发声：引擎会在第一次触摸 / 点击 / 按键时自动解锁。
 * 解锁之前请求的音乐会排队、解锁后开始；音效会被丢弃（以免解锁时一起冒出来）。
 * 切到后台时自动挂起，回到前台时恢复。`tree.paused` 不影响音频。
 */
export class AudioServer {
  private _backend: AudioBackend
  private _buses: Record<AudioBus, BusState> = {
    Master: { volume: 1, muted: false },
    Music: { volume: 1, muted: false },
    SFX: { volume: 1, muted: false },
  }
  private _voices = new Set<Voice>()
  private _warned = new Set<string>()

  /** @internal */
  constructor(backend: AudioBackend) {
    this._backend = backend
  }

  // ---------------------------------------------------------------- 总线

  getBusVolume(bus: AudioBus): number {
    return this._buses[bus].volume
  }

  /** 设置总线音量（0–1），立即作用于正在播放的声音。 */
  setBusVolume(bus: AudioBus, volume: number): void {
    this._buses[bus].volume = clamp01(volume)
    this._refresh()
  }

  isBusMuted(bus: AudioBus): boolean {
    return this._buses[bus].muted
  }

  /** 静音 / 取消静音。静音的总线上的声音继续播放（进度不变），只是听不见。 */
  setBusMute(bus: AudioBus, muted: boolean): void {
    this._buses[bus].muted = muted
    this._refresh()
  }

  // ---------------------------------------------------------------- 播放

  /**
   * 播放一个声音，返回 Voice（可以 stop、改音量、等 finished）。
   * 音效没有预加载时会先加载再播放（有延迟）；应在场景的 `static assets` 里声明。
   */
  play(stream: AudioStream, options: PlayOptions = {}): Voice {
    const voice = new Voice(this, stream, {
      volume: clamp01(options.volume ?? 1),
      loop: options.loop ?? false,
      bus: options.bus ?? (stream.kind === 'music' ? 'Music' : 'SFX'),
    })
    const max = options.maxVoices
    if (max !== undefined) {
      if (!(max >= 0)) throw new Error(`audio.play: maxVoices must be a number >= 0, got ${max}.`)
      let n = 0
      for (const v of this._voices) if (v.stream === stream) n++
      if (n >= max) {
        voice._drop()
        return voice
      }
    }
    this._voices.add(voice)
    if (stream.isLoaded) {
      this._start(voice)
    } else {
      if (!this._warned.has(stream.path)) {
        this._warned.add(stream.path)
        console.warn(`Sound "${stream.path}" was played before it was loaded; declare it in the scene's static assets to avoid the delay.`)
      }
      void this._backend.loadSound(stream.path).then(
        (buffer) => {
          stream._setLoaded(buffer)
          if (voice.playing) this._start(voice)
        },
        (err: unknown) => {
          console.error(`Failed to load sound "${stream.path}":`, err)
          voice.stop()
        },
      )
    }
    return voice
  }

  /** 停止所有声音。 */
  stopAll(): void {
    for (const v of [...this._voices]) v.stop()
  }

  /** 正在播放的声音数量。 */
  get voiceCount(): number {
    return this._voices.size
  }

  private _start(voice: Voice): void {
    const opts = { volume: this._effectiveVolume(voice), loop: voice.loop }
    const handle =
      voice.stream.kind === 'music' ? this._backend.playMusic(voice.stream.path, opts) : this._backend.playSound(voice.stream._buffer, opts)
    voice._handle = handle
    handle.onEnded(() => voice._ended())
  }

  private _refresh(): void {
    for (const v of this._voices) v._handle?.setVolume(this._effectiveVolume(v))
  }

  // ---------------------------------------------------------------- 内部

  /** @internal */
  _effectiveVolume(voice: Voice): number {
    const bus = this._buses[voice.bus]
    const master = this._buses.Master
    if (bus.muted || master.muted) return 0
    return voice.volume * bus.volume * (voice.bus === 'Master' ? 1 : master.volume)
  }

  /** @internal */
  _forget(voice: Voice): void {
    this._voices.delete(voice)
  }

  /** @internal 加载一个音效资源（由场景资源预加载调用）。 */
  async _load(stream: AudioStream): Promise<void> {
    if (stream.isLoaded) return
    stream._setLoaded(await this._backend.loadSound(stream.path))
  }

  /** @internal */
  _setFocused(focused: boolean): void {
    if (focused) this._backend.resume()
    else this._backend.suspend()
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}
