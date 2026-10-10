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

  hit() {
    // 一帧里可能命中几十次：同一个音效最多同时播 3 个，多的直接不播
    this.tree.audio.play(Stage.assets.pop, { maxVoices: 3, volume: 0.6 })
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
  for (let i = 0; i < 10; i++) g.scene.hit()
  expect(g.audio.playing.filter((s) => s.path === 'pop.mp3').length).toBe(3) // 先前的 pop 也算在内
  // #endregion
})
