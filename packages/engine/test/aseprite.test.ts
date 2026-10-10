import { describe, expect, it } from 'vitest'
import { AnimatedSprite2D, aseprite, Scene, tex, v, type AsepriteData, type AsepriteFrameData, type AsepriteTagData } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

const DURATIONS = [100, 200, 40, 40, 160, 100] // 毫秒

/** Aseprite 风格的帧：画布 32×32，导出时裁掉透明边（每帧实际 10×10，在画布里的 (4, 6)）。 */
function frame(i: number): AsepriteFrameData {
  return {
    frame: { x: i * 10, y: 0, w: 10, h: 10 },
    rotated: false,
    trimmed: true,
    spriteSourceSize: { x: 4, y: 6, w: 10, h: 10 },
    sourceSize: { w: 32, h: 32 },
    duration: DURATIONS[i],
  }
}

function data(tags: AsepriteTagData[] = [], extra: Partial<NonNullable<AsepriteData['meta']>> = {}): AsepriteData {
  return {
    frames: DURATIONS.map((_, i) => ({ filename: `hero ${i}.aseprite`, ...frame(i) })),
    meta: { image: 'hero.png', frameTags: tags, slices: [], ...extra },
  }
}

const seq = (anim: { frames: readonly { path: string }[] }) => anim.frames.map((f) => Number(f.path.split('#')[1]))

describe('aseprite：帧', () => {
  it('JSON Array：按导出顺序编号；路径带帧号；裁剪过的帧用画布尺寸；时长换算成秒', () => {
    const a = aseprite('ase-array.png', data())
    expect(a.count).toBe(6)
    expect(a.frames(1, 2).map((t) => t.path)).toEqual(['ase-array.png#1', 'ase-array.png#2'])
    const f = a.frame(3)
    expect([f.width, f.height, f._frame!.region.x, f._frame!.trim!.x, f._frame!.trim!.y]).toEqual([32, 32, 30, 4, 6])
    expect(f._base).toBe(tex('ase-array.png'))
    expect(a.duration(1)).toBeCloseTo(0.2)
  })

  it('JSON Hash：也按导出顺序（不按名字排序）', () => {
    const frames: Record<string, AsepriteFrameData> = {}
    for (const i of [0, 2, 10, 1]) frames[`hero ${i}.aseprite`] = { ...frame(i % 6), frame: { x: i, y: 0, w: 1, h: 1 } }
    const a = aseprite('ase-hash.png', { frames })
    expect([0, 1, 2, 3].map((i) => a.frame(i)._frame!.region.x)).toEqual([0, 2, 10, 1])
  })

  it('越界帧号、空 JSON、旋转打包、非法时长报错', () => {
    expect(() => aseprite('ase-err.png', data()).frame(6)).toThrow(/aseprite\('ase-err.png'\): frame 6 is out of range \(0–5\)/)
    expect(() => aseprite('ase-err.png', { frames: [] })).toThrow(/has no frames/)
    expect(() => aseprite('ase-err.png', { frames: { a: { ...frame(0), rotated: true } } })).toThrow(/rotation disabled/)
    expect(() => aseprite('ase-err.png', { frames: { a: { ...frame(0), duration: 0 } } })).toThrow(/frame 0 has duration 0/)
    expect(() => aseprite('ase-err.png', { frames: { a: { ...frame(0), duration: Infinity } } })).toThrow(/frame 0 has duration Infinity/)
    expect(() => aseprite('ase-err.png', data()).frames(4, 2)).toThrow(/frames\(4, 2\): start must not be greater than end/)
  })
})

describe('aseprite：tag → 动画', () => {
  it('forward：frames + durations；没有 repeat 时循环', () => {
    const a = aseprite<'attack'>('ase-tags.png', data([{ name: 'attack', from: 1, to: 4, direction: 'forward' }]))
    const anim = a.animation('attack')
    expect(seq(anim)).toEqual([1, 2, 3, 4])
    expect(anim.durations).toEqual([0.2, 0.04, 0.04, 0.16])
    expect(anim.loop).toBe(true)
  })

  it('四种方向（循环时）：pingpong 往回走不重复两端', () => {
    const tags = (['forward', 'reverse', 'pingpong', 'pingpong_reverse'] as const).map((direction) => ({ name: direction, from: 1, to: 4, direction }))
    const a = aseprite('ase-dir.png', data(tags))
    expect(seq(a.animation('forward'))).toEqual([1, 2, 3, 4])
    expect(seq(a.animation('reverse'))).toEqual([4, 3, 2, 1])
    expect(seq(a.animation('pingpong'))).toEqual([1, 2, 3, 4, 3, 2])
    expect(seq(a.animation('pingpong_reverse'))).toEqual([4, 3, 2, 1, 2, 3])
    expect(a.animation('pingpong').durations).toEqual([0.2, 0.04, 0.04, 0.16, 0.04, 0.04])
  })

  it('repeat：展开成 N 遍、不循环；pingpong 每趟算一次，从上一趟的终点之后接着走', () => {
    const a = aseprite(
      'ase-repeat.png',
      data([
        { name: 'twice', from: 0, to: 1, direction: 'forward', repeat: '2' },
        { name: 'bounce', from: 0, to: 2, direction: 'pingpong', repeat: '3' },
        { name: 'once', from: 0, to: 2, direction: 'pingpong', repeat: 1 },
        { name: 'forever', from: 0, to: 1, repeat: '0' },
      ]),
    )
    expect([seq(a.animation('twice')), a.animation('twice').loop]).toEqual([[0, 1, 0, 1], false])
    expect(seq(a.animation('bounce'))).toEqual([0, 1, 2, 1, 0, 1, 2])
    expect(seq(a.animation('once'))).toEqual([0, 1, 2])
    expect(a.animation('forever').loop).toBe(true)
  })

  it('覆盖 loop：不循环的 pingpong 走一个来回；有 repeat 却要求循环时按循环的一轮', () => {
    const a = aseprite(
      'ase-loop.png',
      data([
        { name: 'swing', from: 0, to: 2, direction: 'pingpong' },
        { name: 'hit', from: 3, to: 4, repeat: '2' },
      ]),
    )
    expect([seq(a.animation('swing', { loop: false })), a.animation('swing', { loop: false }).loop]).toEqual([[0, 1, 2, 1, 0], false])
    expect([seq(a.animation('hit', { loop: true })), a.animation('hit', { loop: true }).loop]).toEqual([[3, 4], true])
  })

  it('animation() 不传名字：全部帧；animations()：所有 tag，可以按名字覆盖', () => {
    const a = aseprite<'idle' | 'attack'>(
      'ase-all.png',
      data([
        { name: 'idle', from: 0, to: 0, direction: 'forward' },
        { name: 'attack', from: 1, to: 4, direction: 'forward' },
      ]),
    )
    expect(seq(a.animation())).toEqual([0, 1, 2, 3, 4, 5])
    expect(a.animation(undefined, { loop: false }).loop).toBe(false)
    const all = a.animations({ attack: { loop: false } })
    expect(Object.keys(all)).toEqual(['idle', 'attack'])
    expect([all.idle.loop, all.attack.loop]).toEqual([true, false])
    expect(a.tags).toEqual(['idle', 'attack'])
  })

  it('tag 不存在、导出时没加 --list-tags、没有 tag、越界、未知方向时报错', () => {
    const a = aseprite<'idle' | 'jump'>('ase-tagerr.png', data([{ name: 'idle', from: 0, to: 1 }]))
    expect(() => a.animation('jump')).toThrow(/no tag named "jump". Tags: idle/)
    expect(() => a.animations({ jump: { loop: false } })).toThrow(/no tag named "jump"/)
    const noMeta = aseprite('ase-tagerr.png', { frames: data().frames })
    expect(() => noMeta.animation('idle')).toThrow(/no meta.frameTags. Export from Aseprite with --list-tags/)
    expect(() => noMeta.animations()).toThrow(/--list-tags/)
    expect(seq(noMeta.animation())).toHaveLength(6) // 不需要 tag
    expect(() => aseprite('ase-tagerr.png', data()).animations()).toThrow(/has no tags/)
    expect(() => aseprite('ase-tagerr.png', data([{ name: 'x', from: 4, to: 6 }]))).toThrow(/tag "x" covers frames 4–6, but there are 6 frames/)
    expect(() => aseprite('ase-tagerr.png', data([{ name: 'x', from: 0, to: 1, direction: 'sideways' }]))).toThrow(/unknown direction "sideways"/)
    expect(() => aseprite('ase-tagerr.png', data([{ name: 'x', from: 0, to: 1 }, { name: 'x', from: 2, to: 3 }]))).toThrow(/two tags are named "x"/)
  })
})

describe('aseprite：slices', () => {
  const a = aseprite(
    'ase-slices.png',
    data([], {
      slices: [
        {
          name: 'muzzle',
          keys: [
            { frame: 4, bounds: { x: 20, y: 2, w: 4, h: 4 } }, // 顺序打乱：按帧号排序
            { frame: 1, bounds: { x: 26, y: 10, w: 4, h: 2 }, pivot: { x: 2, y: 1 } },
          ],
        },
      ],
    }),
  )

  it('坐标以精灵中心为原点；key 从它的帧开始生效，直到下一个 key；之前没有 key 时为 null', () => {
    expect(a.slice('muzzle', 0)).toBeNull()
    const k = a.slice('muzzle', 2)!
    expect([k.bounds.x, k.bounds.y, k.bounds.width, k.bounds.height]).toEqual([10, -6, 4, 2]) // 画布 32×32，中心 (16, 16)
    expect(k.pivot!.equals(v(12, -5))).toBe(true)
    expect(a.slice('muzzle', 3)).toBe(k) // 同一个 key 覆盖的帧共用一个对象
    const k4 = a.slice('muzzle', 5)!
    expect([k4.bounds.x, k4.bounds.y, k4.pivot]).toEqual([4, -14, null])
    expect(a.sliceNames).toEqual(['muzzle'])
    expect(a.slice('muzzle', a.frame(2))).toBe(k) // 也可以传这张图的一帧（播放中的精灵传 sprite.texture）
  })

  it('原点是这个 key 所在帧的画布中心（图集里的帧大小不一时）', () => {
    const d = data([], { slices: [{ name: 'tip', keys: [{ frame: 0, bounds: { x: 0, y: 0, w: 1, h: 1 } }, { frame: 2, bounds: { x: 0, y: 0, w: 1, h: 1 } }] }] })
    const frames = d.frames as (AsepriteFrameData & { filename: string })[]
    frames[2] = { ...frames[2]!, sourceSize: { w: 64, h: 64 } }
    const b = aseprite('ase-sizes.png', d)
    expect([b.slice('tip', 0)!.bounds.x, b.slice('tip', 2)!.bounds.x]).toEqual([-16, -32])
  })

  it('名字不存在、帧号越界、导出时没加 --list-slices 时报错', () => {
    expect(() => a.slice('tip', 0)).toThrow(/no slice named "tip". Slices: muzzle/)
    expect(() => a.slice('muzzle', 6)).toThrow(/out of range/)
    expect(() => a.slice('muzzle', tex('other.png'))).toThrow(/texture "other.png" is not a frame of this sprite/)
    expect(() => aseprite('ase-slices.png', { frames: data().frames }).slice('muzzle', 0)).toThrow(/no meta.slices. Export from Aseprite with --list-slices/)
  })
})

describe('aseprite：场景资源和播放', () => {
  it('static assets 里加载整张图，切换场景时卸载；animations() 交给 AnimatedSprite2D 按 Aseprite 的时长播放', async () => {
    const hero = aseprite<'idle' | 'attack'>(
      'ase-scene.png',
      data([
        { name: 'idle', from: 0, to: 0 },
        { name: 'attack', from: 1, to: 4 },
      ]),
    )
    class A extends Scene {
      static override assets = { hero }
      sprite!: AnimatedSprite2D<'idle' | 'attack'>
      override ready() {
        this.sprite = this.add(new AnimatedSprite2D({ animations: hero.animations({ attack: { loop: false } }), animation: 'attack', autoplay: true }))
      }
    }
    const g = await createTestGame({ main: A })
    const s = g.scene.sprite
    expect(hero.isLoaded).toBe(true)
    expect(s.getAnimationDuration('attack')).toBeCloseTo(0.44)
    g.stepSeconds(0.25) // 0.2 + 0.04：第 3 帧（攻击里的第 2 帧之后）
    expect(s.texture?.path).toBe('ase-scene.png#3')
    g.stepSeconds(0.25)
    expect([s.isPlaying, s.frame]).toEqual([false, 3])

    await g.tree.changeScene(Scene, undefined as never)
    expect(hero.isLoaded).toBe(false)
  })
})
