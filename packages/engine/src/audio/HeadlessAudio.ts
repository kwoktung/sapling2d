import type { AudioBackend, SoundHandle } from './backend'

/** 无头模式下播放过的一个声音。测试用来断言“播放了什么”。 */
export interface PlayedSound {
  kind: 'sfx' | 'music'
  path: string
  /** 当前实际音量（已乘上总线音量）。 */
  volume: number
  loop: boolean
  /** 已停止或已结束。 */
  ended: boolean
}

/** 无头音频：不发声，只记录。通过 `g.audio` 访问。 */
export class HeadlessAudioBackend implements AudioBackend {
  /** 按播放顺序记录的所有声音。 */
  readonly log: PlayedSound[] = []
  private _suspended = false
  private _endCallbacks = new Map<PlayedSound, () => void>()

  get suspended(): boolean {
    return this._suspended
  }

  /** 正在播放的声音。 */
  get playing(): PlayedSound[] {
    return this.log.filter((s) => !s.ended)
  }

  loadSound(path: string): Promise<unknown> {
    return Promise.resolve({ path })
  }

  playSound(buffer: unknown, options: { volume: number; loop: boolean }): SoundHandle {
    return this._play('sfx', (buffer as { path: string }).path, options)
  }

  playMusic(path: string, options: { volume: number; loop: boolean }): SoundHandle {
    return this._play('music', path, options)
  }

  suspend(): void {
    this._suspended = true
  }

  resume(): void {
    this._suspended = false
  }

  /** 模拟非循环声音自然播放结束（触发 finished）。 */
  finishAll(): void {
    for (const s of this.playing) {
      if (s.loop) continue
      s.ended = true
      this._endCallbacks.get(s)?.()
    }
  }

  private _play(kind: 'sfx' | 'music', path: string, options: { volume: number; loop: boolean }): SoundHandle {
    const entry: PlayedSound = { kind, path, volume: options.volume, loop: options.loop, ended: false }
    this.log.push(entry)
    return {
      setVolume: (v) => (entry.volume = v),
      stop: () => (entry.ended = true),
      onEnded: (cb) => this._endCallbacks.set(entry, cb),
    }
  }
}
