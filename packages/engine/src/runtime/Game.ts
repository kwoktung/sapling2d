import { loadAssets } from '../core/assets'
import type { Scene, SceneClass } from '../core/Scene'
import { SceneTree, type NodeClass } from '../core/SceneTree'
import type { ActionName } from '../core/actions'
import type { InputBinding } from '../core/Input'
import { Viewport, type DesignResolution } from '../core/Viewport'
import type { PhysicsSettings } from '../physics/PhysicsWorld'
import type { Platform } from '../platform/Platform'

/** 渲染器接口：每帧把场景树同步到画面。无头模式没有渲染器。 */
export interface Renderer {
  render(tree: SceneTree): void
  destroy(): void
}

export interface GameOptions<S extends Scene> {
  /** 入口场景。 */
  main: SceneClass<S>
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
}

/**
 * 一局运行中的游戏：持有场景树、平台和（可选的）渲染器，驱动帧循环。
 * 各平台的 `startGame` 和测试用的 `createTestGame` 都基于它。
 */
export class Game<S extends Scene = Scene> {
  readonly tree: SceneTree
  private _platform: Platform
  private _renderer: Renderer | null
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
      tree.audio._setFocused(focused) // 后台时总是挂起声音
      tree.focusChanged.emit(focused)
    })
  }

  /** 创建游戏：注册 Autoload，加载入口场景的资源，然后让场景进入树。 */
  static async create<S extends Scene>(options: GameOptions<S> & { platform: Platform; renderer?: Renderer | null }): Promise<Game<S>> {
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
    tree._setAssetLoader((assets) => loadAssets(assets, options.platform, tree.audio))
    const game = new Game<S>(options.platform, options.renderer ?? null, tree, options.pauseOnBackground ?? true)
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
    this.tree.advance(dt)
    this._renderer?.render(this.tree)
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
