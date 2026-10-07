import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { Scene } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

declare module 'sapling2d' {
  interface StorageRegistry {
    highScore: number
    settings: { music: boolean; volume: number }
    history: number[]
  }
}

describe('tree.storage', () => {
  it('get 不存在时返回默认值；set 后能读回；带类型', async () => {
    const g = await createTestGame({ main: Scene })
    const s = g.tree.storage
    expect(s.get('highScore', 0)).toBe(0)
    expect(s.has('highScore')).toBe(false)
    expect(s.set('highScore', 120)).toBe(true)
    expect(s.get('highScore', 0)).toBe(120)
    expectTypeOf(s.get('highScore', 0)).toEqualTypeOf<number>()

    s.set('settings', { music: false, volume: 0.4 })
    expect(s.get('settings', { music: true, volume: 1 })).toEqual({ music: false, volume: 0.4 })
    s.set('history', [3, 1, 2])
    expect(s.get('history', [])).toEqual([3, 1, 2])
  })

  it('key 自动加前缀；JSON 序列化后存进平台存储', async () => {
    const g = await createTestGame({ main: Scene, storagePrefix: 'suika:' })
    g.tree.storage.set('highScore', 7)
    expect(g.platform.storage.getItem('suika:highScore')).toBe('7')
    expect(g.tree.storage.keys()).toEqual(['highScore'])
  })

  it('数据损坏或类型与默认值不一致时返回默认值', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const g = await createTestGame({ main: Scene })
    g.platform.storage.setItem('sapling2d:highScore', '{not json')
    expect(g.tree.storage.get('highScore', 0)).toBe(0)
    g.platform.storage.setItem('sapling2d:highScore', '"oops"')
    expect(g.tree.storage.get('highScore', 0)).toBe(0)
    g.platform.storage.setItem('sapling2d:history', '{"a":1}')
    expect(g.tree.storage.get('history', [])).toEqual([])
    g.platform.storage.setItem('sapling2d:settings', 'null')
    expect(g.tree.storage.get('settings', { music: true, volume: 1 })).toEqual({ music: true, volume: 1 })
    warn.mockRestore()
  })

  it('remove 与 clear 只影响当前前缀', async () => {
    const g = await createTestGame({ main: Scene })
    g.platform.storage.setItem('other-game:highScore', '999')
    g.tree.storage.set('highScore', 1)
    g.tree.storage.set('history', [1])
    g.tree.storage.remove('highScore')
    expect(g.tree.storage.has('highScore')).toBe(false)
    g.tree.storage.clear()
    expect(g.tree.storage.keys()).toEqual([])
    expect(g.platform.storage.getItem('other-game:highScore')).toBe('999')
  })

  it('写入失败（如超出配额）时返回 false，不抛错', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const g = await createTestGame({ main: Scene })
    vi.spyOn(g.platform.storage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(g.tree.storage.set('highScore', 1)).toBe(false)
    warn.mockRestore()
  })

  it('测试之间相互隔离；可以预置存档数据', async () => {
    const a = await createTestGame({ main: Scene })
    a.tree.storage.set('highScore', 50)
    const b = await createTestGame({ main: Scene })
    expect(b.tree.storage.get('highScore', 0)).toBe(0)
    const c = await createTestGame({ main: Scene, storage: { highScore: 300 } })
    expect(c.tree.storage.get('highScore', 0)).toBe(300)
  })

  it('注册过 key 之后，未注册的 key 和类型不符的值都是类型错误', async () => {
    const g = await createTestGame({ main: Scene })
    // @ts-expect-error 'coins' 没有在 StorageRegistry 中注册
    g.tree.storage.get('coins', 0)
    // @ts-expect-error highScore 是 number
    g.tree.storage.set('highScore', 'a lot')
  })
})
