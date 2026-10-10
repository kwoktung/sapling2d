import type { Container, Sprite } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { AnimatedSprite2D, atlas, Scene, sheet, tex, v, type AtlasData, type Node2D } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { PixiRenderer } from '../src/render/PixiRenderer'

const ATLAS: AtlasData = {
  frames: {
    run_10: { frame: { x: 0, y: 0, w: 10, h: 10 } },
    run_2: { frame: { x: 10, y: 0, w: 10, h: 10 } },
    run_1: { frame: { x: 20, y: 0, w: 10, h: 10 } },
    // 打包时裁掉了透明边：原始 32×32，实际像素在 (4, 6) 起的 20×18
    bullet: { frame: { x: 30, y: 0, w: 20, h: 18 }, trimmed: true, spriteSourceSize: { x: 4, y: 6, w: 20, h: 18 }, sourceSize: { w: 32, h: 32 } },
  },
}

describe('sheet', () => {
  it('按列数 × 行数切帧；帧尺寸在整张图加载后确定；路径带帧号', () => {
    const s = sheet('anim-grid.png', { columns: 4, rows: 2 })
    expect(s.count).toBe(8)
    expect(s.frames()).toHaveLength(8)
    expect(s.frames(2, 4).map((t) => t.path)).toEqual(['anim-grid.png#2', 'anim-grid.png#3', 'anim-grid.png#4'])
    expect(s.frame(0).width).toBe(0) // 未加载

    s.texture._setLoaded(null, 256, 128)
    const f = s.frame(5)._frame!
    expect([f.region.x, f.region.y, f.region.width, f.region.height]).toEqual([64, 64, 64, 64])
    expect([s.frame(5).width, s.frame(5).isLoaded]).toEqual([64, true])
    expect(s.frame(0)._base).toBe(tex('anim-grid.png'))
  })

  it('非法参数和越界帧号报错', () => {
    expect(() => sheet('anim-bad.png', { columns: 0, rows: 1 })).toThrow(/positive integers/)
    expect(() => sheet('anim-bad.png', { columns: 2, rows: 1 }).frame(2)).toThrow(/out of range \(0–1\)/)
    expect(() => sheet('anim-bad.png', { columns: 2, rows: 1 }).frames(1, 0)).toThrow(/frames\(1, 0\): start must not be greater than end/)
  })
})

describe('atlas', () => {
  it('按名字取帧；尺寸来自 JSON（无头模式下也正确）；裁剪过的帧用原始尺寸', () => {
    const a = atlas('anim-atlas.png', ATLAS)
    expect(a.names).toEqual(['run_10', 'run_2', 'run_1', 'bullet'])
    expect(a.get('run_2').path).toBe('anim-atlas.png#run_2')
    const b = a.get('bullet')
    expect([b.width, b.height]).toEqual([32, 32])
    expect(b._frame!.trim!.equals(v(4, 6))).toBe(true)
  })

  it('frames(prefix) 只取“前缀 + 编号”：分隔符和扩展名可选；前缀后面不是编号的不算', () => {
    const a = atlas('anim-prefix.png', {
      frames: Object.fromEntries(
        ['hero_attack_01.png', 'hero_attack_02.png', 'hero_attack_heavy_01.png', 'hero_attack_heavy_02.png', 'boom-1', 'boom 2', 'boom3', 'boomerang_1', 'logo.png'].map((n, i) => [
          n,
          { frame: { x: i, y: 0, w: 1, h: 1 } },
        ]),
      ),
    })
    const names = (prefix: string) => a.frames(prefix).map((t) => t.path.split('#')[1])
    expect(names('hero_attack_')).toEqual(['hero_attack_01.png', 'hero_attack_02.png'])
    expect(names('hero_attack')).toEqual(['hero_attack_01.png', 'hero_attack_02.png']) // 分隔符可以不写在前缀里
    expect(names('hero_attack_heavy_')).toEqual(['hero_attack_heavy_01.png', 'hero_attack_heavy_02.png'])
    expect(names('boom')).toEqual(['boom-1', 'boom 2', 'boom3'])
    // 只有“前缀开头、后面不是编号”的帧：报错里列出来，并提示更长的前缀
    expect(() => a.frames('boomer')).toThrow(/not followed by a number: boomerang_1\. Use a longer prefix \(e\.g\. "boomerang_"\)/)
    expect(() => a.frames('logo')).toThrow(/not followed by a number: logo\.png\. Use a longer prefix \(e\.g\. "logo\.png"\)/)
  })

  it('frames(prefix) 按数字自然排序', () => {
    const a = atlas('anim-atlas.png', ATLAS)
    expect(a.frames('run_').map((t) => t.path)).toEqual(['anim-atlas.png#run_1', 'anim-atlas.png#run_2', 'anim-atlas.png#run_10'])
  })

  it('也支持 JSON Array 格式', () => {
    const a = atlas('anim-array.png', { frames: [{ filename: 'a', frame: { x: 0, y: 0, w: 5, h: 6 } }] })
    expect([a.get('a').width, a.get('a').height]).toEqual([5, 6])
  })

  it('pivot / anchor：帧的锚点（0–1，相对原始尺寸）；正好是中心时当作没有；不是有限数时报错', () => {
    const a = atlas('anim-pivot.png', {
      frames: {
        feet: { frame: { x: 0, y: 0, w: 10, h: 10 }, pivot: { x: 0.5, y: 0.9 } },
        pixi: { frame: { x: 10, y: 0, w: 10, h: 10 }, anchor: { x: 0.25, y: 1 } },
        center: { frame: { x: 20, y: 0, w: 10, h: 10 }, pivot: { x: 0.5, y: 0.5 } },
        none: { frame: { x: 30, y: 0, w: 10, h: 10 } },
      },
    })
    expect(a.get('feet').pivot!.equals(v(0.5, 0.9))).toBe(true)
    expect(a.get('pixi').pivot!.equals(v(0.25, 1))).toBe(true)
    expect([a.get('center').pivot, a.get('none').pivot]).toEqual([null, null])
    expect(sheet('anim-pivot-grid.png', { columns: 2, rows: 1 }).frame(0).pivot).toBeNull()
    expect(() => atlas('anim-pivot-bad.png', { frames: { x: { frame: { x: 0, y: 0, w: 1, h: 1 }, pivot: { x: NaN, y: 0 } } } })).toThrow(/frame "x" has an invalid pivot/)
  })

  it('名字不存在、前缀没有帧、旋转打包时报错', () => {
    const a = atlas('anim-atlas.png', ATLAS)
    expect(() => a.get('run')).toThrow(/no frame named "run". Similar: run_10, run_2, run_1/)
    expect(() => a.frames('jump_')).toThrow(/no frames named "jump_" \+ a number\./)
    expect(() => atlas('anim-rot.png', { frames: { x: { frame: { x: 0, y: 0, w: 1, h: 1 }, rotated: true } } })).toThrow(/rotation disabled/)
  })
})

describe('图集作为场景资源', () => {
  it('static assets 里的 sheet / atlas 加载整张图；切换场景时按整张图判断是否卸载', async () => {
    const boom = sheet('anim-scene-boom.png', { columns: 2, rows: 1 })
    const ui = atlas('anim-scene-ui.png', ATLAS)
    let loaded = false
    class A extends Scene {
      static override assets = { boom, ui }
      override ready() {
        loaded = boom.isLoaded && ui.get('bullet').isLoaded
      }
    }
    // B 用另一种写法引用同一张图：应保留；ui 只在 A 里：应卸载
    class B extends Scene {
      static override assets = { boomTex: tex('anim-scene-boom.png') }
    }
    const g = await createTestGame({ main: A })
    expect(loaded).toBe(true)
    await g.tree.changeScene(B, undefined as never)
    expect([boom.isLoaded, ui.isLoaded]).toEqual([true, false])
  })
})

describe('AnimatedSprite2D', () => {
  const frames = sheet('anim-player.png', { columns: 4, rows: 1 }).frames()

  async function setup(sprite: Node2D) {
    const g = await createTestGame({ main: Scene })
    g.scene.add(sprite)
    return g
  }

  it('按 fps 推进；循环；texture 跟随当前帧；frameChanged 每次换帧触发', async () => {
    const s = new AnimatedSprite2D({ frames, fps: 10, autoplay: true })
    let changes = 0
    s.frameChanged.connect(() => changes++)
    const g = await setup(s)
    expect([s.frame, s.texture]).toEqual([0, frames[0]])
    g.step(6) // 0.1 秒
    expect([s.frame, s.texture]).toEqual([1, frames[1]])
    g.step(18) // 共 0.4 秒：转了一圈回到 0
    expect(s.frame).toBe(0)
    expect(changes).toBe(4)
    expect(s.isPlaying).toBe(true)
  })

  it('不循环：停在最后一帧，触发一次 animationFinished；再 play() 从头播', async () => {
    const s = new AnimatedSprite2D({ frames, fps: 10, loop: false, autoplay: true })
    const finished: string[] = []
    s.animationFinished.connect((name) => finished.push(name))
    const g = await setup(s)
    g.step(60)
    expect([s.frame, s.isPlaying, finished]).toEqual([3, false, ['default']])
    s.play()
    expect(s.frame).toBe(0)
    g.step(6)
    expect(s.frame).toBe(1)
  })

  it('没有 autoplay 时不动；pause 停在当前帧；stop 回到第 0 帧；frame 可以赋值（截断）', async () => {
    const s = new AnimatedSprite2D({ frames, fps: 10 })
    const g = await setup(s)
    g.step(30)
    expect(s.frame).toBe(0)
    s.play()
    g.step(12)
    s.pause()
    g.step(30)
    expect(s.frame).toBe(2)
    s.stop()
    expect([s.frame, s.isPlaying]).toEqual([0, false])
    s.frame = 99
    expect([s.frame, s.texture]).toEqual([3, frames[3]])
  })

  it('多套动画：play(name) 切换并从第 0 帧开始；名字有类型检查；未知名字报错', async () => {
    const other = sheet('anim-hurt.png', { columns: 2, rows: 1 }).frames()
    const s = new AnimatedSprite2D({
      animations: { idle: { frames, fps: 10 }, hurt: { frames: other, fps: 20, loop: false } },
      autoplay: true,
    })
    const g = await setup(s)
    expect(s.animation).toBe('idle')
    g.step(12)
    s.play('hurt')
    expect([s.animation, s.frame, s.texture]).toEqual(['hurt', 0, other[0]])
    const done = s.animationFinished.wait()
    g.step(6) // 20fps × 2 帧 = 0.1 秒
    expect(await done).toEqual('hurt')
    // @ts-expect-error 不存在的动画名
    expect(() => s.play('jump')).toThrow(/unknown animation "jump". Animations: idle, hurt/)
  })

  it('speedScale 改变播放速度；树暂停时停止', async () => {
    const s = new AnimatedSprite2D({ frames, fps: 10, autoplay: true, speedScale: 2 })
    const g = await setup(s)
    g.step(6)
    expect(s.frame).toBe(2)
    g.tree.paused = true
    g.step(30)
    expect(s.frame).toBe(2)
  })

  it('durations：每帧按自己的时长推进；循环和 animationFinished 照常', async () => {
    const s = new AnimatedSprite2D({
      animations: {
        attack: { frames, durations: [0.1, 0.5, 0.05, 0.2], loop: false },
        spin: { frames: frames.slice(0, 2), durations: [0.1, 0.3] },
      },
      autoplay: true,
    })
    const finished: string[] = []
    s.animationFinished.connect((name) => finished.push(name))
    const g = await setup(s)
    g.step(6) // 0.1
    expect(s.frame).toBe(1)
    g.step(29) // 0.583：还在第 1 帧（到 0.6 才换）
    expect(s.frame).toBe(1)
    g.step(1) // 0.6
    expect(s.frame).toBe(2)
    g.step(3) // 0.65
    expect(s.frame).toBe(3)
    g.step(12) // 0.85：播完
    expect([s.frame, s.isPlaying, finished]).toEqual([3, false, ['attack']])

    s.play('spin')
    g.step(6)
    expect(s.frame).toBe(1)
    g.step(18) // 一圈 0.4 秒：回到 0
    expect(s.frame).toBe(0)
  })

  it('speedScale 很大、一次跨过好几帧时，每一帧都触发 frameChanged（命中帧不会被跳过）', async () => {
    const s = new AnimatedSprite2D({ frames, durations: [0.05, 0.01, 0.01, 0.05], loop: false, autoplay: true, speedScale: 10 })
    const seen: number[] = []
    s.frameChanged.connect(() => seen.push(s.frame))
    const g = await setup(s)
    g.step() // 1/60 × 10 ≈ 0.167 秒：整套动画（0.12 秒）在一次推进里播完
    expect(seen).toEqual([1, 2, 3])
    expect(s.isPlaying).toBe(false)
  })

  it('getAnimationDuration / getFrameTime：不算 speedScale；名字和帧号检查', () => {
    const s = new AnimatedSprite2D({
      animations: { idle: { frames, fps: 8 }, attack: { frames, durations: [0.1, 0.2, 0.04, 0.16] } },
      speedScale: 3,
    })
    expect(s.getAnimationDuration()).toBeCloseTo(0.5) // 当前动画 idle：4 帧 × 1/8
    expect(s.getAnimationDuration('attack')).toBeCloseTo(0.5)
    expect([0, 1, 2, 3].map((i) => s.getFrameTime('attack', i))).toEqual([0, 0.1, expect.closeTo(0.3), expect.closeTo(0.34)])
    expect(() => s.getFrameTime('attack', 4)).toThrow(/frame 4 out of range for animation "attack" \(0–3\)/)
    // @ts-expect-error 不存在的动画名
    expect(() => s.getAnimationDuration('jump')).toThrow(/unknown animation "jump"/)
  })

  it('durations 参数错误时报错', () => {
    expect(() => new AnimatedSprite2D({ frames, durations: [0.1, 0.1] })).toThrow(/animation "default" has 4 frames but 2 durations/)
    expect(() => new AnimatedSprite2D({ frames, durations: [0.1, 0, 0.1, 0.1] })).toThrow(/duration of frame 1 must be > 0, got 0/)
    expect(() => new AnimatedSprite2D({ animations: { hit: { frames, fps: 10, durations: [1, 1, 1, 1] } } })).toThrow(
      /animation "hit": pass either `fps` or `durations`, not both/,
    )
  })

  it('dump 显示当前帧和播放状态；构造参数错误时报错', async () => {
    const s = new AnimatedSprite2D({ name: 'Boom', frames, autoplay: true })
    const g = await setup(s)
    expect(g.dump()).toContain('Boom (AnimatedSprite2D) position=(0, 0) texture=anim-player.png#0 frame=0 playing=true')
    expect(() => new AnimatedSprite2D({})).toThrow(/pass `frames` or `animations`/)
    expect(() => new AnimatedSprite2D({ frames: [] })).toThrow(/has no frames/)
    expect(() => new AnimatedSprite2D({ frames, animations: { a: { frames } } })).toThrow(/not both/)
  })
})

describe('渲染：子区域', () => {
  it('同一张图的各帧共用一个图片源；frame / orig / trim 写到 Pixi 贴图；卸载后一起释放', async () => {
    const g = await createTestGame({ main: Scene })
    const r = PixiRenderer._createForSyncTests()
    const a = atlas('anim-render.png', ATLAS)
    a.texture._setLoaded({ width: 64, height: 32 }, 64, 32) // 假图片对象：同步阶段不会上传到 GPU
    const s = g.scene.add(new AnimatedSprite2D({ frames: a.frames('run_'), autoplay: true, fps: 60 }))
    const bullet = g.scene.add(new AnimatedSprite2D({ frames: [a.get('bullet')] }))
    r.sync(g.tree)
    g.step()
    r.sync(g.tree)
    expect([r._sourceCount, r._textureCount]).toEqual([1, 2 + 1]) // run_1、run_2、bullet

    const pixi = ((bullet.unsafePixi as Container).children[0] as Sprite).texture
    expect([pixi.frame.x, pixi.frame.width, pixi.orig.width, pixi.trim?.x, pixi.trim?.y]).toEqual([30, 20, 32, 4, 6])
    expect(pixi.source).toBe(((s.unsafePixi as Container).children[0] as Sprite).texture.source)

    s.queueFree()
    bullet.queueFree()
    g.step()
    a.texture._unload()
    r.sync(g.tree)
    expect([r._sourceCount, r._textureCount]).toEqual([0, 0])
  })
})
