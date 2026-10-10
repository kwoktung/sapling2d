import { describe, expect, it, vi } from 'vitest'
import { AudioStreamPlayer, music, Scene, sfx } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

const POP = sfx('pop.mp3')
const BGM = music('bgm.mp3')

describe('tree.audio', () => {
  it('static assets 里的音效在 ready 之前加载完成；音乐是流式的，不需要预加载', async () => {
    let loaded = false
    class Main extends Scene {
      static override assets = { pop: sfx('preload-pop.mp3'), bgm: music('preload-bgm.mp3') }
      override ready() {
        loaded = Main.assets.pop.isLoaded && Main.assets.bgm.isLoaded
      }
    }
    await createTestGame({ main: Main })
    expect(loaded).toBe(true)
    expect(sfx('a.mp3')).toBe(sfx('a.mp3'))
    expect(sfx('a.mp3')).not.toBe(music('a.mp3'))
  })

  it('音效可以同时播放多个；音效默认走 SFX 总线，音乐走 Music 总线', async () => {
    class Main extends Scene {
      static override assets = { pop: POP }
    }
    const g = await createTestGame({ main: Main })
    g.tree.audio.play(POP)
    g.tree.audio.play(POP, { volume: 0.5 })
    const bgm = g.tree.audio.play(BGM, { loop: true })
    expect(g.audio.playing.map((s) => `${s.kind}:${s.path}:${s.volume}:${s.loop}`)).toEqual([
      'sfx:pop.mp3:1:false',
      'sfx:pop.mp3:0.5:false',
      'music:bgm.mp3:1:true',
    ])
    expect(bgm.bus).toBe('Music')
    expect(g.tree.audio.voiceCount).toBe(3)
  })

  it('maxVoices：同一个声音已经有这么多个在播时不再播放（返回已停止的 Voice），播完一个又能播', async () => {
    class Main extends Scene {
      static override assets = { pop: POP }
    }
    const g = await createTestGame({ main: Main })
    const audio = g.tree.audio
    const voices = Array.from({ length: 5 }, () => audio.play(POP, { maxVoices: 2 }))
    expect(voices.map((v) => v.playing)).toEqual([true, true, false, false, false])
    expect(g.audio.log.length).toBe(2)
    audio.play(BGM, { maxVoices: 2 }) // 别的声音不受影响
    expect(audio.voiceCount).toBe(3)
    voices[0]!.stop()
    expect(audio.play(POP, { maxVoices: 2 }).playing).toBe(true)
    expect(audio.play(POP).playing).toBe(true) // 不传就不限
    expect(() => audio.play(POP, { maxVoices: -1 })).toThrow('maxVoices')
  })

  it('总线音量：实际音量 = 声音 × 总线 × Master，立即作用于正在播放的声音；静音为 0', async () => {
    class Main extends Scene {
      static override assets = { pop: POP }
    }
    const g = await createTestGame({ main: Main })
    const a = g.tree.audio
    a.play(POP, { volume: 0.8 })
    a.play(BGM)
    const [pop, bgm] = g.audio.playing
    a.setBusVolume('SFX', 0.5)
    a.setBusVolume('Master', 0.5)
    expect(pop!.volume).toBeCloseTo(0.2)
    expect(bgm!.volume).toBeCloseTo(0.5)

    a.setBusMute('Music', true)
    expect(bgm!.volume).toBe(0)
    expect(pop!.volume).toBeCloseTo(0.2)
    a.setBusMute('Music', false)
    expect(bgm!.volume).toBeCloseTo(0.5)
    a.setBusMute('Master', true)
    expect(pop!.volume).toBe(0)
  })

  it('Voice：stop、改音量、自然结束时触发 finished（循环的不会结束）', async () => {
    class Main extends Scene {
      static override assets = { pop: POP }
    }
    const g = await createTestGame({ main: Main })
    const once = g.tree.audio.play(POP)
    const looped = g.tree.audio.play(POP, { loop: true })
    let finished = 0
    once.finished.connect(() => finished++)
    once.volume = 0.3
    expect(g.audio.log[0]!.volume).toBeCloseTo(0.3)
    g.audio.finishAll()
    expect(finished).toBe(1)
    expect(once.playing).toBe(false)
    expect(looped.playing).toBe(true)
    looped.stop()
    expect(g.audio.playing).toEqual([])
  })

  it('播放未预加载的音效：先加载再播放，并给出提示', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const g = await createTestGame({ main: Scene })
    const late = sfx('late.mp3')
    g.tree.audio.play(late)
    expect(g.audio.log).toHaveLength(0)
    await Promise.resolve()
    await Promise.resolve()
    expect(g.audio.log.map((s) => s.path)).toEqual(['late.mp3'])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('late.mp3'))
    warn.mockRestore()
  })

  it('切到后台时挂起声音，回来时恢复（即使 pauseOnBackground 为 false）', async () => {
    const g = await createTestGame({ main: Scene, pauseOnBackground: false })
    g.setFocus(false)
    expect(g.audio.suspended).toBe(true)
    g.setFocus(true)
    expect(g.audio.suspended).toBe(false)
  })
})

describe('AudioStreamPlayer', () => {
  it('autoplay；再次 play 会先停掉上一个；离开树时停止；dump 显示状态', async () => {
    class Main extends Scene {
      bgm!: AudioStreamPlayer
      override ready() {
        this.bgm = this.add(new AudioStreamPlayer({ name: 'Bgm', stream: BGM, loop: true, autoplay: true, volume: 0.6 }))
      }
    }
    const g = await createTestGame({ main: Main })
    const p = g.scene.bgm
    expect(p.playing).toBe(true)
    expect(g.audio.playing).toEqual([{ kind: 'music', path: 'bgm.mp3', volume: 0.6, loop: true, ended: false }])
    expect(g.dump()).toContain('Bgm (AudioStreamPlayer) stream=bgm.mp3 playing=true loop=true volume=0.6')

    p.play()
    expect(g.audio.log).toHaveLength(2)
    expect(g.audio.playing).toHaveLength(1)

    p.volume = 0.2
    expect(g.audio.playing[0]!.volume).toBeCloseTo(0.2)

    g.scene.remove(p)
    expect(p.playing).toBe(false)
    expect(g.audio.playing).toHaveLength(0)
  })

  it('非循环播放结束时节点触发 finished；被销毁时停止', async () => {
    class Main extends Scene {
      static override assets = { pop: POP }
    }
    const g = await createTestGame({ main: Main })
    const p = g.scene.add(new AudioStreamPlayer({ stream: POP }))
    let finished = 0
    p.finished.connect(() => finished++)
    p.play()
    g.audio.finishAll()
    expect(finished).toBe(1)
    expect(p.playing).toBe(false)

    p.play()
    p.queueFree()
    g.step()
    expect(g.audio.playing).toHaveLength(0)
  })

  it('没有 stream 时 play 给出明确报错', async () => {
    const g = await createTestGame({ main: Scene })
    const p = g.scene.add(new AudioStreamPlayer({ name: 'Empty' }))
    expect(() => p.play()).toThrow(/"Empty" has no stream/)
  })
})
