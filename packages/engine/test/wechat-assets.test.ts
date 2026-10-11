import { afterEach, describe, expect, it, vi } from 'vitest'
import { WechatAssetPaths, type WechatAssetManifest } from '../src/platform/wechat/assets'
import { WechatAudioBackend, type WxAudioApi } from '../src/platform/wechat/audio'

const MANIFEST: WechatAssetManifest = { main: ['boot/logo.png'], subpackage: { name: 'assets', root: 'assets-sub/' } }

type Progress = { progress: number; totalBytesWritten: number; totalBytesExpectedToWrite: number }

/** 假的 wx.loadSubpackage：每次调用记下来，由测试决定成功 / 失败、发进度事件。 */
function fakeWx() {
  const calls: { name: string; succeed(): void; fail(msg: string): void; progress(p: Progress): void }[] = []
  const api = {
    loadSubpackage(o: { name: string; success?: () => void; fail?: (err: { errMsg: string }) => void }) {
      let onProgress: (p: Progress) => void = () => {}
      calls.push({ name: o.name, succeed: () => o.success?.(), fail: (errMsg) => o.fail?.({ errMsg }), progress: (p) => onProgress(p) })
      return { onProgressUpdate: (cb: (p: Progress) => void) => (onProgress = cb) }
    },
  }
  return { api, calls }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))
const bytes = (written: number, total = 1000): Progress => ({ progress: written / total, totalBytesWritten: written, totalBytesExpectedToWrite: total })

describe('WechatAssetPaths', () => {
  afterEach(() => vi.useRealTimers())

  it('没有清单（不是 saplingWechat 构建的）时都在 assets/，prepare 立即完成', async () => {
    const { api, calls } = fakeWx()
    const paths = new WechatAssetPaths(api, undefined)
    expect(await paths.resolve('a.png')).toBe('assets/a.png')
    expect(paths.resolveNow('bgm.mp3')).toBe('assets/bgm.mp3')
    await paths.prepare(() => {})
    expect(calls).toHaveLength(0)
  })

  it('主包里的资源直接读；分包里的资源在 prepare 之前请求时报错，指向 boot/', async () => {
    const { api } = fakeWx()
    const paths = new WechatAssetPaths(api, MANIFEST)
    expect(await paths.resolve('boot/logo.png')).toBe('assets/boot/logo.png')
    await expect(paths.resolve('hero.png')).rejects.toThrow(/"hero\.png" is in the asset subpackage.*public\/assets\/boot\//)
    expect(() => paths.resolveNow('bgm.mp3')).toThrow(/"bgm\.mp3" is in the asset subpackage/)
  })

  it('分包只下载一次；下载期间请求的资源等它完成，之后同步路径也可用', async () => {
    const { api, calls } = fakeWx()
    const paths = new WechatAssetPaths(api, MANIFEST)
    const prepared = paths.prepare(() => {})
    void paths.prepare(() => {})
    let resolved = ''
    void paths.resolve('levels/1.json').then((p) => (resolved = p))
    await flush()
    expect(calls.map((c) => c.name)).toEqual(['assets'])
    expect(resolved).toBe('')
    expect(() => paths.resolveNow('bgm.mp3')).toThrow()
    calls[0]!.succeed()
    await prepared
    await flush()
    expect(resolved).toBe('assets-sub/levels/1.json')
    expect(paths.resolveNow('bgm.mp3')).toBe('assets-sub/bgm.mp3')
  })

  it('进度按字节数算，只增不减，忽略坏数据（真机最后一个事件的期望字节数是 2^32-1）；结束时是 1', async () => {
    const { api, calls } = fakeWx()
    const paths = new WechatAssetPaths(api, MANIFEST)
    const seen: number[] = []
    const prepared = paths.prepare((p) => seen.push(p))
    await flush()
    const c = calls[0]!
    c.progress(bytes(100))
    c.progress(bytes(500))
    c.progress(bytes(400)) // 倒退：忽略
    c.progress({ progress: -3160179, totalBytesWritten: 0, totalBytesExpectedToWrite: 4294967295 })
    c.progress({ progress: 0, totalBytesWritten: 10, totalBytesExpectedToWrite: 0 })
    c.succeed()
    await prepared
    expect(seen).toEqual([0.1, 0.5, 1])
  })

  it('有缓存时没有进度事件：直接汇报 1', async () => {
    const { api, calls } = fakeWx()
    const seen: number[] = []
    const paths = new WechatAssetPaths(api, MANIFEST)
    const prepared = paths.prepare((p) => seen.push(p))
    await flush()
    calls[0]!.succeed()
    await prepared
    expect(seen).toEqual([1])
  })

  it('下载失败时隔 1 秒重试，最多重试 2 次；都失败时报错，之后请求分包资源也报同样的错', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { api, calls } = fakeWx()
    const paths = new WechatAssetPaths(api, MANIFEST)
    const prepared = paths.prepare(() => {})
    prepared.catch(() => {})
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(0)
      calls[i]!.fail('loadSubpackage:fail network')
      await vi.advanceTimersByTimeAsync(1000)
    }
    await expect(prepared).rejects.toThrow(/failed to download the asset subpackage "assets" after 3 attempts: loadSubpackage:fail network/)
    await expect(paths.resolve('hero.png')).rejects.toThrow(/after 3 attempts/)
    expect(calls).toHaveLength(3)
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('重试成功时正常完成', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { api, calls } = fakeWx()
    const paths = new WechatAssetPaths(api, MANIFEST)
    const prepared = paths.prepare(() => {})
    await vi.advanceTimersByTimeAsync(0)
    calls[0]!.fail('loadSubpackage:fail timeout')
    await vi.advanceTimersByTimeAsync(1000)
    calls[1]!.succeed()
    await prepared
    expect(paths.resolveNow('hero.png')).toBe('assets-sub/hero.png')
    warn.mockRestore()
  })

  it('所有资源都在主包（subpackage 为 null）时不下载', async () => {
    const { api, calls } = fakeWx()
    const paths = new WechatAssetPaths(api, { main: ['a.png'], subpackage: null })
    await paths.prepare(() => {})
    expect(calls).toHaveLength(0)
    expect(paths.resolveNow('b.png')).toBe('assets/b.png') // 不在清单里也按主包处理（没有分包）
  })
})

describe('WechatAudioBackend 的资源路径', () => {
  it('音效从分包读（等分包下载完），音乐用同步路径；分包没下载完时播放分包里的音乐报错', async () => {
    const read: string[] = []
    const inner: { src: string }[] = []
    const api = {
      createWebAudioContext: () => ({
        state: 'running',
        destination: {},
        resume() {},
        createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
        decodeAudioData: (_d: ArrayBuffer, ok: (b: unknown) => void) => ok({}),
      }),
      createInnerAudioContext: () => {
        const a = { src: '', loop: false, volume: 1, play() {}, pause() {}, stop() {}, destroy() {}, onEnded() {}, onError() {} }
        inner.push(a)
        return a
      },
      getFileSystemManager: () => ({
        readFile: (o: { filePath: string; success?: (r: { data: ArrayBuffer }) => void }) => {
          read.push(o.filePath)
          o.success?.({ data: new ArrayBuffer(8) })
        },
      }),
      onTouchStart() {},
    } as unknown as WxAudioApi
    const { api: wxApi, calls } = fakeWx()
    const paths = new WechatAssetPaths(wxApi, MANIFEST)
    const audio = new WechatAudioBackend(api, paths)
    expect(() => audio.playMusic('bgm.mp3', { volume: 1, loop: true })).toThrow(/asset subpackage/)
    const prepared = paths.prepare(() => {})
    const loading = audio.loadSound('pop.mp3')
    await flush()
    expect(read).toEqual([])
    calls[0]!.succeed()
    await prepared
    await loading
    expect(read).toEqual(['assets-sub/pop.mp3'])
    audio.playMusic('bgm.mp3', { volume: 1, loop: true })
    expect(inner.map((a) => a.src)).toEqual(['assets-sub/bgm.mp3'])
  })
})
