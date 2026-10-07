import { describe, expect, it } from 'vitest'
import { AudioServer, sfx, music, Storage } from 'sapling2d'
import { WechatAudioBackend, type WxAudioApi } from '../src/platform/wechat/audio'
import { WechatStorageBackend } from '../src/platform/wechat/storage'

/** 假的 wx 存储：getStorageSync 对不存在的 key 返回 ''（与真实 API 一致） */
function fakeStorage() {
  const data = new Map<string, unknown>()
  return {
    data,
    api: {
      getStorageSync: (k: string) => (data.has(k) ? data.get(k) : ''),
      setStorageSync: (k: string, v: unknown) => void data.set(k, v),
      removeStorageSync: (k: string) => void data.delete(k),
      getStorageInfoSync: () => ({ keys: [...data.keys()] }),
    },
  }
}

describe('WechatStorageBackend', () => {
  it('配合引擎的 Storage：读写、默认值、前缀、删除', () => {
    const { data, api } = fakeStorage()
    const storage = new Storage(new WechatStorageBackend(api), 'merge:')
    expect(storage.get('best' as never, 0)).toBe(0) // 不存在：'' → 默认值
    storage.set('best' as never, 128 as never)
    expect(data.get('merge:best')).toBe('128')
    expect(storage.get('best' as never, 0)).toBe(128)
    data.set('other:x', '1')
    expect(storage.keys()).toEqual(['best'])
    storage.remove('best' as never)
    expect(storage.has('best' as never)).toBe(false)
  })
})

/** 假的 wx 音频：WebAudioContext 初始状态 'default'（真机实测），resume 后 'running' */
function fakeAudio() {
  const sources: { started: boolean; stopped: boolean; loop: boolean; gain: { value: number }; end(): void }[] = []
  const inner: { src: string; loop: boolean; volume: number; playing: boolean; destroyed: boolean; end(): void }[] = []
  let touch: (() => void) | null = null
  const ctx = {
    state: 'default',
    destination: {},
    resumeCalls: 0,
    resume() {
      this.resumeCalls++
      if (this.resumeCalls >= 2) this.state = 'running' // 模拟：创建时 resume 不生效，触摸后才生效
    },
    suspend() {
      this.state = 'suspended'
    },
    decodeAudioData(_data: ArrayBuffer, ok?: (b: { duration: number }) => void) {
      ok?.({ duration: 0.2 })
    },
    createGain() {
      return { gain: { value: 1 }, connect: () => {}, disconnect: () => {} }
    },
    createBufferSource() {
      const gainRef = { value: 1 }
      const src = {
        buffer: null as unknown,
        loop: false,
        onended: null as (() => void) | null,
        connect: (g: { gain: { value: number } }) => Object.assign(gainRef, { ref: g.gain }),
        disconnect: () => {},
        start: () => (record.started = true),
        stop: () => {
          record.stopped = true
          src.onended?.()
        },
      }
      const record = {
        started: false,
        stopped: false,
        get loop() {
          return src.loop
        },
        get gain() {
          return (gainRef as unknown as { ref: { value: number } }).ref
        },
        end: () => src.onended?.(),
      }
      sources.push(record)
      return src
    },
  }
  const api: WxAudioApi = {
    createWebAudioContext: () => ctx as never,
    createInnerAudioContext: () => {
      let onEnded = () => {}
      const a = {
        src: '',
        loop: false,
        volume: 1,
        playing: false,
        destroyed: false,
        play: () => (a.playing = true),
        pause: () => (a.playing = false),
        stop: () => (a.playing = false),
        destroy: () => (a.destroyed = true),
        onEnded: (cb: () => void) => (onEnded = cb),
        onError: () => {},
        end: () => onEnded(),
      }
      inner.push(a)
      return a as never
    },
    getFileSystemManager: () => ({ readFile: (o: { success?: (r: { data: ArrayBuffer }) => void }) => o.success?.({ data: new ArrayBuffer(8) }) }) as never,
    onTouchStart: (cb) => (touch = cb),
    offTouchStart: () => (touch = null),
  }
  return { api, ctx, sources, inner, touch: () => touch?.() }
}

describe('WechatAudioBackend', () => {
  it('第一次触摸前音效被丢弃；触摸后解锁，音效叠加播放，总线音量生效', async () => {
    const fake = fakeAudio()
    const backend = new WechatAudioBackend(fake.api)
    const server = new AudioServer(backend)
    const pop = sfx('wx-pop.mp3')
    await server._load(pop)
    expect(pop.isLoaded).toBe(true)

    server.play(pop)
    expect(fake.sources).toHaveLength(0) // 未解锁：丢弃
    fake.touch()
    expect(backend.unlocked).toBe(true)

    server.play(pop, { volume: 0.5 })
    server.play(pop)
    expect(fake.sources.map((s) => s.started)).toEqual([true, true])
    server.setBusVolume('SFX', 0.5)
    expect(fake.sources[0]!.gain.value).toBeCloseTo(0.25)
  })

  it('音乐用 InnerAudioContext：循环、音量、停止时 destroy；自然结束时也 destroy', () => {
    const fake = fakeAudio()
    const server = new AudioServer(new WechatAudioBackend(fake.api))
    const bgm = server.play(music('bgm.mp3'), { loop: true, volume: 0.4 })
    const a = fake.inner[0]!
    expect([a.src, a.loop, a.volume, a.playing]).toEqual(['assets/bgm.mp3', true, 0.4, true])
    bgm.stop()
    expect(a.destroyed).toBe(true)

    const once = server.play(music('jingle.mp3'))
    let finished = 0
    once.finished.connect(() => finished++)
    fake.inner[1]!.end()
    expect(fake.inner[1]!.destroyed).toBe(true)
    expect(finished).toBe(1)
  })

  it('切到后台：挂起 WebAudio、暂停音乐；回来后恢复', () => {
    const fake = fakeAudio()
    const backend = new WechatAudioBackend(fake.api)
    const server = new AudioServer(backend)
    fake.touch()
    server.play(music('bgm.mp3'), { loop: true })
    server._setFocused(false)
    expect(fake.ctx.state).toBe('suspended')
    expect(fake.inner[0]!.playing).toBe(false)
    server._setFocused(true)
    expect(fake.inner[0]!.playing).toBe(true)
  })
})
