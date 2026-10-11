import { describe, expect, it } from 'vitest'
import { ColorRect, DefaultLoadingScene, Game, Scene, SceneTree, tex, type LoadingScreen } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { HeadlessPlatform } from '../src/platform/HeadlessPlatform'
import type { LoadedImage } from '../src/platform/Platform'

/** 图片加载要手动放行的无头平台（boot/ 下的立即完成）：`finish(path)` 让对应的图片加载完成。 */
class SlowPlatform extends HeadlessPlatform {
  readonly waiting = new Map<string, () => void>()
  readonly failing = new Set<string>()
  prepareAssets?: (onProgress: (done: number) => void) => Promise<void>

  override loadImage(path: string): Promise<LoadedImage> {
    if (path.startsWith('boot/')) return super.loadImage(path)
    if (this.failing.has(path)) return Promise.reject(new Error('404'))
    return new Promise((resolve) => this.waiting.set(path, () => resolve({ resource: null, width: 1, height: 1 })))
  }

  finish(path: string): void {
    const resolve = this.waiting.get(path)
    if (!resolve) throw new Error(`${path} is not loading`)
    this.waiting.delete(path)
    resolve()
  }
}

/** 渲染器看到的当前场景；内置启动页附带进度条填充的 scale.x。 */
function describeScene(tree: SceneTree): string {
  const scene = tree.currentScene
  if (!scene) return '(none)'
  if (!(scene instanceof DefaultLoadingScene)) return scene.constructor.name
  const fill = scene.children[0]!.children[0] as ColorRect
  return `DefaultLoadingScene ${fill.scale.x}`
}

/** 让已排队的微任务（加载完成的回调）都执行完。 */
const flush = () => new Promise<void>((r) => setTimeout(r, 0))

let run = 0

/** 每个测试一套新的资源和场景：同一路径的 tex() 是同一个对象，加载过就一直是已加载状态。 */
function setup() {
  run++
  const logo = tex(`boot/ls-logo-${run}.png`)
  const a = tex(`ls-a-${run}.png`)
  const b = tex(`ls-b-${run}.png`)
  class Splash extends Scene {
    static override assets = { logo }
    static last: Splash | null = null
    readonly progress: number[] = []
    override ready() {
      Splash.last = this
    }
    override process() {
      this.progress.push(this.tree.loadProgress)
    }
  }
  class Main extends Scene {
    static override assets = { a, b }
  }
  return { logo, a, b, Splash, Main }
}

describe('启动页', () => {
  it('先显示启动页并开始帧循环；进度按资源个数增加到 1；加载完切到入口场景，启动页和它独有的资源被释放', async () => {
    const { Splash, Main, logo, a, b } = setup()
    const platform = new SlowPlatform()
    let done = false
    const created = Game.create({ main: Main, loading: Splash, platform, start: true }).then((g) => ((done = true), g))
    await flush()
    const splash = Splash.last!
    expect(splash.isInsideTree).toBe(true)
    expect(logo.isLoaded).toBe(true)

    platform.advance(16)
    platform.finish(a.path)
    await flush()
    platform.advance(16)
    platform.advance(16)
    expect(done).toBe(false)
    platform.finish(b.path)
    const game = await created

    expect(splash.progress).toEqual([0, 0.5, 0.5])
    expect(game.scene).toBeInstanceOf(Main)
    expect(game.tree.loadProgress).toBe(1)
    expect(splash.isFreed).toBe(true)
    expect(logo.isLoaded).toBe(false) // 入口场景没有声明：被卸载
    expect([a.isLoaded, b.isLoaded]).toEqual([true, true])
    game.stop()
  })

  it('平台的 prepareAssets 先于入口场景的资源，占进度的前 70%', async () => {
    const { Splash, Main, a, b } = setup()
    const platform = new SlowPlatform()
    let report: (done: number) => void = () => {}
    let finishPrepare: () => void = () => {}
    platform.prepareAssets = (onProgress) => {
      report = onProgress
      return new Promise<void>((r) => (finishPrepare = r))
    }
    const created = Game.create({ main: Main, loading: Splash, platform, start: true })
    await flush()
    const splash = Splash.last!
    platform.advance(16)
    report(0.5)
    platform.advance(16)
    expect(platform.waiting.size).toBe(0) // 准备完之前不加载入口场景的资源
    finishPrepare()
    await flush()
    platform.advance(16)
    platform.finish(a.path)
    await flush()
    platform.advance(16)
    platform.finish(b.path)
    const game = await created
    expect(splash.progress.map((p) => Math.round(p * 100))).toEqual([0, 35, 70, 85])
    game.stop()
  })

  it('启动页实现 loaded() 时，资源加载完后等它完成再切换', async () => {
    const { Splash, Main, a, b } = setup()
    class TapToStart extends Splash implements LoadingScreen {
      continue: () => void = () => {}
      loaded() {
        return new Promise<void>((r) => (this.continue = r))
      }
    }
    const platform = new SlowPlatform()
    const created = Game.create({ main: Main, loading: TapToStart, platform, start: true })
    await flush()
    const splash = Splash.last as TapToStart
    platform.finish(a.path)
    platform.finish(b.path)
    await flush()
    platform.advance(16)
    expect(splash.progress).toEqual([1])
    expect(splash.isInsideTree).toBe(true)
    splash.continue()
    const game = await created
    expect(game.scene).toBeInstanceOf(Main)
    game.stop()
  })

  it('入口场景的资源加载失败：Game.create 报错，启动页留在原地', async () => {
    const { Splash, Main, a, b } = setup()
    const platform = new SlowPlatform()
    platform.failing.add(a.path)
    const created = Game.create({ main: Main, loading: Splash, platform, start: true })
    await expect(created).rejects.toThrow(a.path)
    expect(Splash.last!.isInsideTree).toBe(true)
  })

  it('不传 loading 时用内置的进度条（填充宽度跟随 loadProgress）；传 null 时不显示启动页', async () => {
    const drawn: string[] = []
    const renderer = { render: (tree: SceneTree) => void drawn.push(describeScene(tree)), destroy() {} }
    const { Main, a, b } = setup()
    const platform = new SlowPlatform()
    const created = Game.create({ main: Main, platform, renderer, start: true })
    await flush()
    platform.advance(16)
    platform.finish(a.path)
    await flush()
    platform.advance(16)
    platform.finish(b.path)
    const game = await created
    platform.advance(16)
    expect(drawn).toEqual(['DefaultLoadingScene 0', 'DefaultLoadingScene 0.5', 'Main'])
    game.stop()

    drawn.length = 0
    const second = setup()
    const quiet = new SlowPlatform()
    const g2 = Game.create({ main: second.Main, loading: null, platform: quiet, renderer, start: true })
    await flush()
    quiet.advance(16)
    quiet.finish(second.a.path)
    quiet.finish(second.b.path)
    expect((await g2).scene).toBeInstanceOf(second.Main)
    expect(drawn).toEqual(['(none)']) // 没有启动页：加载期间树里没有场景
  })

  it('createTestGame 默认不显示启动页；changeScene 期间也更新 loadProgress', async () => {
    const { Main, a, b } = setup()
    const g = await createTestGame({ main: Main })
    expect(g.tree.loadProgress).toBe(1)
    class Other extends Scene {
      static override assets = { x: tex('ls-x.png'), y: tex('ls-y.png') }
    }
    const p = g.tree.changeScene(Other)
    expect(g.tree.loadProgress).toBe(1) // 替换在微任务里开始
    await p
    expect(g.tree.loadProgress).toBe(1)
  })
})
