import type { AudioBus, Voice } from '../audio/AudioServer'
import type { AudioStream } from '../audio/AudioStream'
import { Node, type NodeOptions } from '../core/Node'
import { Signal } from '../core/Signal'

export interface AudioStreamPlayerOptions extends NodeOptions {
  stream?: AudioStream | null
  /** 音量 0–1，默认 1。 */
  volume?: number
  /** 循环播放，默认 false。 */
  loop?: boolean
  /** 所在总线；默认音效走 SFX，音乐走 Music。 */
  bus?: AudioBus
  /** 进入树时自动播放，默认 false。 */
  autoplay?: boolean
}

/**
 * 播放声音的节点。同一个播放器同一时间只播放一个声音：再次 play() 会先停掉上一个。
 * 节点离开树或被销毁时自动停止。一次性音效用 `this.tree.audio.play(stream)` 更简单。
 *
 * ```ts
 * this.bgm = this.add(new AudioStreamPlayer({ stream: Main.assets.bgm, loop: true, autoplay: true }))
 * this.bgm.volume = 0.5
 * ```
 */
export class AudioStreamPlayer extends Node {
  /** 自然播放结束时触发（循环播放和被 stop 时不触发）。 */
  readonly finished = new Signal()
  stream: AudioStream | null
  loop: boolean
  bus: AudioBus | null
  autoplay: boolean
  private _volume: number
  private _voice: Voice | null = null
  private _autoplayed = false

  constructor(options: AudioStreamPlayerOptions = {}) {
    super(options)
    this.stream = options.stream ?? null
    this._volume = options.volume ?? 1
    this.loop = options.loop ?? false
    this.bus = options.bus ?? null
    this.autoplay = options.autoplay ?? false
  }

  get volume(): number {
    return this._volume
  }

  set volume(value: number) {
    this._volume = value
    if (this._voice) this._voice.volume = value
  }

  get playing(): boolean {
    return this._voice?.playing ?? false
  }

  /** 从头播放 stream。节点必须在树里。 */
  play(): void {
    if (!this.stream) throw new Error(`AudioStreamPlayer "${this.name}" has no stream to play.`)
    this.stop()
    const voice = this.tree.audio.play(this.stream, { volume: this._volume, loop: this.loop, ...(this.bus ? { bus: this.bus } : {}) })
    voice.finished.connect(() => {
      if (this._voice === voice) this._voice = null
      this.finished.emit()
    })
    this._voice = voice
  }

  stop(): void {
    this._voice?.stop()
    this._voice = null
  }

  /** @internal */
  override _onEnterTree(): void {
    if (this.autoplay && !this._autoplayed && this.stream) {
      this._autoplayed = true
      this.play()
    }
  }

  /** @internal */
  override _onExitTree(): void {
    this.stop()
  }

  protected override dumpProps(): Record<string, unknown> {
    return {
      stream: this.stream?.path ?? null,
      playing: this.playing || undefined,
      loop: this.loop || undefined,
      volume: this._volume !== 1 ? this._volume : undefined,
    }
  }
}
