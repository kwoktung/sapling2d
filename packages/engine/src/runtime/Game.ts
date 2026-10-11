import { loadAssets } from '../core/assets'
import type { Scene, SceneClass } from '../core/Scene'
import { SceneTree, type NodeClass } from '../core/SceneTree'
import type { ActionName } from '../core/actions'
import type { InputBinding } from '../core/Input'
import { Viewport, type DesignResolution } from '../core/Viewport'
import type { PhysicsSettings } from '../physics/PhysicsWorld'
import type { Platform } from '../platform/Platform'
import { DefaultLoadingScene } from './DefaultLoadingScene'

/** 渲染器接口：每帧把场景树同步到画面。无头模式没有渲染器。 */
export interface Renderer {
  render(tree: SceneTree): void
  destroy(): void
}

/** `game.frameStats` 的内容（毫秒）。 */
export interface FrameStats {
  frames: number
  intervalAvg: number
  intervalMax: number
  logicAvg: number
  logicMax: number
  renderAvg: number
  renderMax: number
  /** 按平均帧间隔算的帧率。 */
  fps: number
}

class FrameStatsAccumulator implements FrameStats {
  frames = 0
  intervalMax = 0
  logicMax = 0
  renderMax = 0
  private _interval = 0
  private _logic = 0
  private _render = 0

  get intervalAvg(): number {
    return this.frames ? this._interval / this.frames : 0
  }
  get logicAvg(): number {
    return this.frames ? this._logic / this.frames : 0
  }
  get renderAvg(): number {
    return this.frames ? this._render / this.frames : 0
  }
  get fps(): number {
    return this._interval ? (1000 * this.frames) / this._interval : 0
  }

  _add(interval: number, logic: number, render: number): void {
    this.frames++
    this._interval += interval
    this._logic += logic
    this._render += render
    if (interval > this.intervalMax) this.intervalMax = interval
    if (logic > this.logicMax) this.logicMax = logic
    if (render > this.renderMax) this.renderMax = render
  }

  _reset(): void {
    this.frames = this._interval = this._logic = this._render = 0
    this.intervalMax = this.logicMax = this.renderMax = 0
  }
}

/** 启动页场景可以实现的接口。 */
export interface LoadingScreen {
  /**
   * 资源都加载完、切到入口场景之前调用；返回 Promise 时等它完成再切换。
   * 用来保证最短显示时间或“点击继续”：`async loaded() { await this.tree.createTimer(1).timeout }`。
   */
  loaded?(): void | Promise<void>
}

/** 启动时准备资源包（`Platform.prepareAssets`）占加载进度的比例，其余是加载入口场景的资源。 */
const PREPARE_SHARE = 0.7

export interface GameOptions<S extends Scene> {
  /** 入口场景。 */
  main: SceneClass<S>
  /**
   * 启动页：先显示它，再加载入口场景的资源，加载完切到入口场景（启动页被销毁）。
   * 它的 `static assets` 先于其他资源加载，应尽量少；微信小游戏里必须放在主包（`public/assets/boot/`）。
   * 进度读 `this.tree.loadProgress`；实现 `loaded()` 可以推迟切换（见 LoadingScreen）。
   * 不传时用内置的进度条；传 `null` 时不显示启动页。
   */
  loading?: SceneClass<Scene & LoadingScreen> | null
  /** 全局单例节点，按顺序在入口场景之前创建，切换场景时保留。 */
  autoloads?: NodeClass[]
  /** 随机数种子。不传时用当前时间；测试里应固定。 */
  seed?: number
  /** 设计分辨率和拉伸模式，默认 750×1334、expand。游戏里的坐标都以设计分辨率为准。 */
  design?: DesignResolution
  /** 输入动作：`{ drop: [pointerPress(), key('Space')] }`。之后用 `tree.input.isActionPressed('drop')` 查询。 */
  actions?: Partial<Record<ActionName, InputBinding[]>>
  /** 物理设置：`{ pixelsPerMeter: 50, gravity: v(0, 980), velocityIterations: 8, positionIterations: 3 }`。 */
  physics?: PhysicsSettings
  /** 切到后台时挂起主循环（不推进时间、不渲染），默认 true。为 false 时只触发 `tree.focusChanged`。 */
  pauseOnBackground?: boolean
  /** 存储 key 的前缀，默认 'sapling2d:'。同一域名下有多个游戏时应各自设置。 */
  storagePrefix?: string
  /**
   * 像素风，默认 false。打开后所有贴图用最近邻采样（放大后不模糊），精灵的顶点对齐到物理像素（缩放倍数不是整数时也没有半像素的边缘）。
   * 文字不受影响。只影响画面：节点的 `position` 不取整，游戏逻辑和无头测试不受影响。
   */
  pixelArt?: boolean
}

/**
 * 一局运行中的游戏：持有场景树、平台和（可选的）渲染器，驱动帧循环。
 * 各平台的 `startGame` 和测试用的 `createTestGame` 都基于它。
 */
export class Game<S extends Scene = Scene> {
  readonly tree: SceneTree
  private _platform: Platform
  private _renderer: Renderer | null
  private readonly _stats = new FrameStatsAccumulator()
  private _frameId: number | null = null
  private _lastTime = 0
  private _unsubscribeScreen: () => void
  private _unsubscribeInput: () => void
  private _unsubscribeFocus: () => void
  private _suspended = false

  private constructor(platform: Platform, renderer: Renderer | null, tree: SceneTree, pauseOnBackground: boolean) {
    this._platform = platform
    this._renderer = renderer
    this.tree = tree
    this._unsubscribeScreen = platform.onScreenChange((screen) => tree.viewport._update(screen))
    this._unsubscribeInput = platform.onInput((event) => tree.input._enqueue(event))
    this._unsubscribeFocus = platform.onFocusChange((focused) => {
      if (pauseOnBackground) {
        this._suspended = !focused
        if (focused) {
          // 回到前台：时间从现在重新算，物理不补算后台那段
          tree._resetAccumulator()
          this._lastTime = platform.now()
        }
      }
      if (!focused) tree.input._releaseAll() // 切到后台时手指和按键的抬起收不到：当作全部松开
      tree.audio._setFocused(focused) // 后台时总是挂起声音
      tree.focusChanged.emit(focused)
    })
  }

  /**
   * 创建游戏：注册 Autoload，显示启动页，准备资源包，加载入口场景的资源，然后让入口场景进入树。
   * `start: true` 时启动页进入树后就开始帧循环（各平台的 startGame）；否则由调用方驱动帧（无头测试），这时不等启动页的 `loaded()`。
   */
  static async create<S extends Scene>(options: GameOptions<S> & { platform: Platform; renderer?: Renderer | null; start?: boolean }): Promise<Game<S>> {
    const viewport = new Viewport(options.design ?? { width: 750, height: 1334 }, options.platform.getScreenInfo())
    const tree = new SceneTree({
      viewport,
      ...(options.seed === undefined ? {} : { seed: options.seed }),
      ...(options.physics ? { physics: options.physics } : {}),
      audioBackend: options.platform.audio,
      storageBackend: options.platform.storage,
      ...(options.storagePrefix ? { storagePrefix: options.storagePrefix } : {}),
    })
    for (const [name, bindings] of Object.entries(options.actions ?? {})) {
      if (bindings) tree.input.addAction(name as ActionName, bindings)
    }
    for (const cls of options.autoloads ?? []) tree._addAutoload(cls)
    const platform = options.platform
    tree._setAssetLoader((assets, onProgress) => loadAssets(assets, platform, tree.audio, onProgress))
    const game = new Game<S>(platform, options.renderer ?? null, tree, options.pauseOnBackground ?? true)
    const loading = options.loading === undefined ? DefaultLoadingScene : options.loading
    const screen: (Scene & LoadingScreen) | null = loading ? await tree.changeScene(loading) : null
    if (options.start) game.start()
    let from = 0
    if (platform.prepareAssets) {
      tree._setLoadProgress(0)
      await platform.prepareAssets((done) => tree._setLoadProgress(done * PREPARE_SHARE))
      from = PREPARE_SHARE
    }
    // 先把入口场景的资源加载完（进度走到 1），启动页同意后再切换；changeScene 里不会再加载
    tree._setLoadProgress(from)
    await loadAssets(options.main.assets, platform, tree.audio, (done) => tree._setLoadProgress(from + done * (1 - from)))
    tree._setLoadProgress(1)
    // 没有帧循环（无头测试）时启动页不会推进：不等它，否则等计时器的 loaded() 永远完成不了
    if (options.start) await screen?.loaded?.()
    await tree.changeScene(options.main)
    return game
  }

  get platform(): Platform {
    return this._platform
  }

  get scene(): S {
    return this.tree.currentScene as S
  }

  /** 是否因切到后台而挂起。 */
  get suspended(): boolean {
    return this._suspended
  }

  /** 推进一帧并渲染。`dt` 单位为秒。挂起时什么都不做。 */
  frame(dt: number): void {
    if (this._suspended) return
    const now = this._platform
    const t0 = now.now()
    this.tree.advance(dt)
    const t1 = now.now()
    this._renderer?.render(this.tree)
    const t2 = now.now()
    this._stats._add(dt * 1000, t1 - t0, t2 - t1)
  }

  /**
   * 帧耗时统计（从上次 `resetFrameStats()` 起）：帧数、平均 / 最大帧间隔、逻辑（`tree.advance`）和渲染（同步 + 提交绘制）的平均 / 最大耗时，单位毫秒。
   * 只累加数字，不分配内存；用来在真机上看性能（例如每隔几秒 console.log 一次再 reset）。
   */
  get frameStats(): Readonly<FrameStats> {
    return this._stats
  }

  resetFrameStats(): void {
    this._stats._reset()
  }

  /** 开始由平台驱动的帧循环。 */
  start(): void {
    if (this._frameId !== null) return
    this._lastTime = this._platform.now()
    const loop = (time: number) => {
      const dt = (time - this._lastTime) / 1000
      this._lastTime = time
      this.frame(dt)
      this._frameId = this._platform.requestFrame(loop)
    }
    this._frameId = this._platform.requestFrame(loop)
  }

  stop(): void {
    if (this._frameId !== null) this._platform.cancelFrame(this._frameId)
    this._frameId = null
  }

  destroy(): void {
    this.stop()
    this._unsubscribeScreen()
    this._unsubscribeInput()
    this._unsubscribeFocus()
    this._renderer?.destroy()
  }
}
