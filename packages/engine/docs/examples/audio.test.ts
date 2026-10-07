// #region example
import { AudioStreamPlayer, music, Scene, sfx } from 'sapling2d'

export class Stage extends Scene {
  // 音效预解码（可叠加），音乐流式播放；格式统一用 mp3
  static override assets = { pop: sfx('pop.mp3'), bgm: music('bgm.mp3') }

  override ready() {
    this.add(new AudioStreamPlayer({ stream: Stage.assets.bgm, loop: true, volume: 0.5, autoplay: true }))
  }

  pop() {
    this.tree.audio.play(Stage.assets.pop) // 一次性音效
  }

  toggleMusic() {
    const audio = this.tree.audio
    audio.setBusMute('Music', !audio.isBusMuted('Music')) // 总线：Master / Music / SFX
  }
}
// 浏览器在第一次触摸 / 点击 / 按键时自动解锁声音；切到后台自动挂起
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('audio', async () => {
  // #region test
  const g = await createTestGame({ main: Stage })
  g.scene.pop()
  g.scene.toggleMusic()
  // 无头模式不发声，只记录：g.audio.log / g.audio.playing；g.audio.finishAll() 模拟播放结束
  expect(g.audio.log.map((s) => `${s.kind}:${s.path}:${s.volume}`)).toEqual(['music:bgm.mp3:0', 'sfx:pop.mp3:1'])
  // #endregion
})
