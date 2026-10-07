/** 一个正在播放的声音。 */
export interface SoundHandle {
  /** 设置实际音量（0–1，已乘上总线音量）。 */
  setVolume(volume: number): void
  stop(): void
  /** 自然播放结束（非循环、未被 stop）时回调。 */
  onEnded(callback: () => void): void
}

/**
 * 平台的音频实现。引擎的 AudioServer 在它之上实现总线、音量和节点；平台只负责真正发声。
 * 浏览器：WebAudio（音效）+ HTMLAudioElement（音乐）。小游戏：wx.createWebAudioContext + InnerAudioContext。
 */
export interface AudioBackend {
  /** 加载并解码一个音效，返回平台自己的音频数据。`path` 相对于资源目录。 */
  loadSound(path: string): Promise<unknown>
  /** 播放已解码的音效。 */
  playSound(buffer: unknown, options: { volume: number; loop: boolean }): SoundHandle
  /** 流式播放音乐。 */
  playMusic(path: string, options: { volume: number; loop: boolean }): SoundHandle
  /** 切到后台时挂起所有声音。 */
  suspend(): void
  resume(): void
}
