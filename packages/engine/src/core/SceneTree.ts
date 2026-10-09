import type { Camera2D } from '../nodes/Camera2D'
import type { TileMapLayer } from '../nodes/TileMapLayer'
import { RandomNumberGenerator } from '../math/RandomNumberGenerator'
import { fmt } from '../math/Vector2'
import { PhysicsWorld, type PhysicsSettings } from '../physics/PhysicsWorld'
import { AudioServer } from '../audio/AudioServer'
import type { AudioBackend } from '../audio/backend'
import { HeadlessAudioBackend } from '../audio/HeadlessAudio'
import { SceneTreeTimer } from '../nodes/Timer'
import { MemoryStorageBackend, type StorageBackend } from '../storage/backend'
import { Storage } from '../storage/Storage'
import { Input } from './Input'
import { Signal } from './Signal'
import { Tween } from './Tween'
import type { GroupName, GroupNodeType } from './groups'
import { Node, type DumpNode } from './Node'
import { assetRoot, type AssetMap } from './assets'
import type { Scene, SceneConstructor } from './Scene'
import { Viewport } from './Viewport'

export interface SceneTreeOptions {
  /** 随机数种子。同一个 seed、同样的输入，游戏的运行结果完全一致。 */
  seed?: number
  /**
   * 每帧最多补跑的物理步数。超出部分直接丢弃：宁可游戏变慢，也不要越补越卡。
   * 没有 JIT 的 iOS 小游戏上这一点很关键（见 spikes/wechat/REPORT.md 第 8 节）。
   */
  maxPhysicsStepsPerFrame?: number
  /** 视口。不传时是 750×1334 的设计分辨率，屏幕与之相同。 */
  viewport?: Viewport
  /** 物理设置：像素/米换算、重力、迭代次数。 */
  physics?: PhysicsSettings
  /** 平台的音频实现。不传时不发声（只记录）。 */
  audioBackend?: AudioBackend
  /** 平台的键值存储。不传时用内存。 */
  storageBackend?: StorageBackend
  /** 存储 key 的前缀，默认 'sapling2d:'。同一域名下有多个游戏时应各自设置。 */
  storagePrefix?: string
}

export interface DumpOptions {
  /** 输出 JSON 结构，而不是缩进文本。 */
  json?: boolean
}

/** 可以无参构造的节点类，用于 Autoload。 */
export type NodeClass<T extends Node = Node> = new () => T

/** 浮点误差容忍：累加 n 次 1/60 之后仍应恰好触发 n 次物理步。 */
const EPSILON = 1e-9
/** 单帧 dt 上限（秒）。切后台回来时避免一次性补算巨大的时间。 */
const MAX_FRAME_DELTA = 0.25
/** 帧末延迟调用最多连续执行的轮数，防止回调里无限追加回调。 */
const MAX_DEFERRED_ROUNDS = 100

/**
 * 场景树：持有 Autoload 和当前场景，驱动主循环。
 *
 * 每帧（`advance(dt)`）的顺序：
 * 1. 处理输入队列（节点的指针信号在这里触发）
 * 2. 按固定步长跑若干次物理步：每步先调用所有节点的 `physicsProcess`，再推进物理世界并写回刚体位置
 * 3. 跑一次 `process`，然后推进补间动画（Tween）和一次性计时器（createTimer）
 * 4. 执行 `callDeferred` 排队的回调
 * 5. 销毁 `queueFree` 排队的节点
 *
 * 遍历顺序是先序（父先于子），Autoload 在当前场景之前；本帧中新加入的节点从下一帧开始处理。
 */
export class SceneTree {
  /** 物理步频（Hz）。 */
  static readonly PHYSICS_TICKS_PER_SECOND = 60

  /** 每个物理步的时长（秒），也是 `physicsProcess(dt)` 收到的 dt。 */
  readonly physicsDelta = 1 / SceneTree.PHYSICS_TICKS_PER_SECOND
  readonly maxPhysicsStepsPerFrame: number
  /** 游戏应使用这个随机数生成器，而不是 Math.random，以保证可复现。 */
  readonly rng: RandomNumberGenerator
  /** 视口：设计分辨率、可见区域、安全区和坐标换算。 */
  readonly viewport: Viewport
  /** 输入：动作、键盘、指针状态。 */
  readonly input: Input
  /** 音频：播放声音、总线音量。 */
  readonly audio: AudioServer
  /** 持久化存储：最高分、设置等。 */
  readonly storage: Storage

  /** 内部根节点：子节点依次是各个 Autoload，最后是当前场景。 */
  private readonly _root = new Node({ name: 'root' })
  private _scene: Scene | null = null
  private _autoloads = new Map<NodeClass, Node>()
  private _accumulator = 0
  private _physicsFrames = 0
  private _processFrames = 0
  private _deferred: (() => void)[] = []
  private _paused = false
  /** 当前场景被替换后触发（参数是新场景）。 */
  readonly sceneChanged = new Signal<[scene: Scene]>()
  private _loadAssets: (assets: AssetMap | undefined) => Promise<void> = async () => {}
  private _changeChain: Promise<unknown> = Promise.resolve()
  private _currentArgs: { cls: SceneConstructor; args: unknown[] } | null = null
  /** 游戏切到后台（false）或回到前台（true）时触发。默认情况下引擎会在后台挂起主循环。 */
  readonly focusChanged = new Signal<[focused: boolean]>()
  private _tweens: Tween[] = []
  private _timers: SceneTreeTimer[] = []
  private _physicsSettings: PhysicsSettings
  private _physics: PhysicsWorld | null = null
  /** @internal 树里覆写了 `physicsProcess` 的节点数；为 0 时物理步不遍历节点。 */
  _physicsProcessNodes = 0
  /** @internal 正在调用各节点的 physicsProcess（`CharacterBody2D.moveAndSlide` 只能在这时调用）。 */
  _inPhysicsProcess = false
  /** @internal 树里的相机（进入树时登记、离开时注销）和当前相机。 */
  readonly _cameras: Camera2D[] = []
  _currentCamera: Camera2D | null = null
  /** @internal 树里的 TileMapLayer（进入树时登记、离开时注销），CharacterBody2D 按它们做格子碰撞。 */
  readonly _tileLayers: TileMapLayer[] = []
  private _freeQueue: Node[] = []

  constructor(options: SceneTreeOptions = {}) {
    this.rng = new RandomNumberGenerator(options.seed)
    this.maxPhysicsStepsPerFrame = options.maxPhysicsStepsPerFrame ?? 2
    this.viewport = options.viewport ?? new Viewport({ width: 750, height: 1334 }, { width: 750, height: 1334, pixelRatio: 1 })
    this.input = new Input(this.viewport, () => this._root.children)
    this._physicsSettings = options.physics ?? {}
    this.audio = new AudioServer(options.audioBackend ?? new HeadlessAudioBackend())
    this.storage = new Storage(options.storageBackend ?? new MemoryStorageBackend(), options.storagePrefix ?? 'sapling2d:')
    this._root._attachAsRoot(this)
  }

  get currentScene(): Scene | null {
    return this._scene
  }

  /** 已执行的物理步数。 */
  get physicsFrames(): number {
    return this._physicsFrames
  }

  /** 已执行的渲染帧数。 */
  get processFrames(): number {
    return this._processFrames
  }

  /** 游戏内经过的时间（秒），按物理步累计，与真实时间无关。 */
  get time(): number {
    return this._physicsFrames * this.physicsDelta
  }

  /** `this.rng.randf()` 的简写：[0, 1) 之间的随机数。 */
  rand(): number {
    return this.rng.randf()
  }

  /**
   * 暂停：processMode 为 pausable 的节点停止处理（process、physicsProcess、Tween、Timer、指针事件），物理世界停止。
   * processMode 为 always 的节点（如暂停菜单）照常运行。
   */
  get paused(): boolean {
    return this._paused
  }

  set paused(value: boolean) {
    this._paused = value
  }

  /** 物理世界：重力、像素/米换算。第一次访问（通常是第一个刚体进入树）时创建。 */
  get physics(): PhysicsWorld {
    return (this._physics ??= new PhysicsWorld(this._physicsSettings))
  }

  /** @internal 已经创建的物理世界；还没有刚体用过时为 null（不触发创建）。 */
  get _physicsIfCreated(): PhysicsWorld | null {
    return this._physics
  }

  // ---------------------------------------------------------------- Autoload

  /**
   * @internal 注册 Autoload：构造一个全局单例节点，放在当前场景之前，切换场景时保留。必须在第一个场景之前注册。
   * 游戏通过启动参数 `autoloads: [...]` 注册，不直接调用这个方法。
   */
  _addAutoload<T extends Node>(cls: NodeClass<T>): T {
    if (this._autoloads.has(cls)) throw new Error(`Autoload ${cls.name} is already registered.`)
    if (this._scene) throw new Error(`Autoload ${cls.name} must be registered before the first scene starts.`)
    const node = new cls()
    this._autoloads.set(cls, node)
    this._root.add(node)
    return node
  }

  /** 按类型取 Autoload 单例：`this.tree.autoload(GameState).score += 1`。 */
  autoload<T extends Node>(cls: NodeClass<T>): T {
    const node = this._autoloads.get(cls)
    if (!node) {
      throw new Error(`Autoload ${cls.name} is not registered. Pass it in the game options: autoloads: [${cls.name}].`)
    }
    return node as T
  }

  // ---------------------------------------------------------------- 场景

  /**
   * 切换场景：加载新场景的 `static assets`，然后销毁当前场景、让新场景进入树。返回新场景。
   *
   * ```ts
   * this.tree.changeScene(GameOver, { score: this.score }) // 参数类型由 GameOver 的构造函数决定
   * ```
   *
   * - 替换发生在资源加载完之后的微任务里，不会打断当前帧；在那之前旧场景继续运行
   * - 连续多次调用按顺序执行，最后一次生效
   * - Autoload 保留；旧场景声明、新场景没有声明的资源会被卸载
   */
  changeScene<C extends SceneConstructor>(cls: C, ...args: ConstructorParameters<C>): Promise<InstanceType<C>> {
    const run = async () => {
      await this._loadAssets(cls.assets)
      const scene = new cls(...args) as InstanceType<C>
      const oldAssets = this._currentArgs?.cls.assets
      this._currentArgs = { cls, args }
      this._setScene(scene)
      this._unloadUnused(oldAssets, cls.assets)
      this.sceneChanged.emit(scene)
      return scene
    }
    const result = this._changeChain.then(run, run)
    this._changeChain = result.catch(() => {})
    return result
  }

  /** 用上一次的参数重新创建当前场景（重开一局）。 */
  reloadCurrentScene(): Promise<Scene> {
    if (!this._currentArgs) throw new Error('reloadCurrentScene: no scene has been loaded with changeScene yet.')
    const { cls, args } = this._currentArgs
    return this.changeScene(cls, ...(args as []))
  }

  /** @internal 由 Game 注入：加载 / 卸载资源。 */
  _setAssetLoader(load: (assets: AssetMap | undefined) => Promise<void>): void {
    this._loadAssets = load
  }

  private _unloadUnused(oldAssets: AssetMap | undefined, newAssets: AssetMap | undefined): void {
    if (!oldAssets) return
    // 图集和子区域归结到整张图：新场景用同一张图（哪怕是另一种写法）就保留
    const keep = new Set(Object.values(newAssets ?? {}).map(assetRoot))
    for (const asset of new Set(Object.values(oldAssets).map(assetRoot))) if (!keep.has(asset)) asset._unload()
  }

  /** @internal 立即替换当前场景并销毁旧场景（不加载资源）。游戏代码请用 changeScene。 */
  _setScene(scene: Scene): void {
    const old = this._scene
    this._scene = scene
    old?._free()
    this._root.add(scene)
  }

  // ---------------------------------------------------------------- 补间与计时

  /** 创建一个不绑定节点的补间动画（不会随节点销毁而停止）。通常应使用 node.createTween()。 */
  createTween(): Tween {
    return this._addTween(new Tween(null))
  }

  /** @internal */
  _addTween(tween: Tween): Tween {
    this._tweens.push(tween)
    return tween
  }

  /**
   * 一次性计时器：`await this.tree.createTimer(1).timeout`。
   * 由帧循环驱动（无头测试里随 step 推进）。默认暂停时也继续计时（与 Godot 相同），`processAlways: false` 时随暂停停止。
   */
  createTimer(seconds: number, options: { processAlways?: boolean } = {}): SceneTreeTimer {
    const t = new SceneTreeTimer(seconds, options.processAlways ?? true)
    this._timers.push(t)
    return t
  }

  // ---------------------------------------------------------------- 分组

  /**
   * 树中属于某个分组的所有节点，按树的先序排列。
   * 在 GroupRegistry 里注册过的组会返回对应的节点类型。
   */
  getNodesInGroup<K extends GroupName>(group: K): GroupNodeType<K>[] {
    return this._snapshot().filter((n) => n.isInGroup(group)) as GroupNodeType<K>[]
  }

  /** 组里的第一个节点，没有则返回 null。 */
  getFirstNodeInGroup<K extends GroupName>(group: K): GroupNodeType<K> | null {
    return this.getNodesInGroup(group)[0] ?? null
  }

  // ---------------------------------------------------------------- 帧末队列

  /** 在当前帧末尾调用 `fn`（所有 process 之后、销毁节点之前）。 */
  callDeferred(fn: () => void): void {
    this._deferred.push(fn)
  }

  /** @internal 由 Node.queueFree() 调用。 */
  _queueFree(node: Node): void {
    this._freeQueue.push(node)
  }

  private _flushFrameEnd(): void {
    for (let round = 0; this._deferred.length > 0; round++) {
      if (round >= MAX_DEFERRED_ROUNDS) throw new Error(`callDeferred kept scheduling new calls for ${MAX_DEFERRED_ROUNDS} rounds; possible infinite loop.`)
      const calls = this._deferred
      this._deferred = []
      for (const fn of calls) fn()
    }
    while (this._freeQueue.length > 0) {
      const queue = this._freeQueue
      this._freeQueue = []
      for (const node of queue) {
        if (node === this._scene) this._scene = null
        node._free()
      }
    }
  }

  // ---------------------------------------------------------------- 主循环

  /**
   * 推进一帧。`dt` 是距离上一帧的真实时间（秒）。
   * 由平台的帧循环调用；无头测试里由 `step()` 调用。
   */
  advance(dt: number): void {
    // 本帧中新建的补间和计时器从下一帧开始推进
    const tweenCount = this._tweens.length
    const timerCount = this._timers.length
    this.input._flush()
    // 输入回调里的 queueFree / callDeferred 也在本帧末尾生效
    const frameDt = Math.min(Math.max(dt, 0), MAX_FRAME_DELTA)
    this._accumulator += frameDt
    let steps = 0
    while (this._accumulator >= this.physicsDelta - EPSILON && steps < this.maxPhysicsStepsPerFrame) {
      this._accumulator -= this.physicsDelta
      steps++
      this._physicsFrames++
      // 整个物理步（physicsProcess 和刚体的接触信号）里，isActionJustPressed 都按物理步算
      this.input._inPhysics = true
      try {
        if (this._physicsProcessNodes > 0) {
          this._inPhysicsProcess = true
          try {
            for (const node of this._snapshot()) if (node.canProcess()) node.physicsProcess(this.physicsDelta)
          } finally {
            this._inPhysicsProcess = false
          }
        }
        if (!this._paused) this._physics?._step(this.physicsDelta)
      } finally {
        this.input._inPhysics = false
        this.input._endPhysicsStep()
      }
    }
    // 达到上限还有剩余：丢弃，而不是留到下一帧继续补
    if (this._accumulator >= this.physicsDelta - EPSILON) this._accumulator = 0
    if (this._accumulator < 0) this._accumulator = 0

    this._processFrames++
    for (const node of this._snapshot()) {
      if (!node.canProcess()) continue
      node._internalProcess(frameDt)
      if (node.canProcess()) node.process(frameDt)
    }
    const tweens = this._tweens
    this._tweens = []
    for (let i = 0; i < tweens.length; i++) if (i >= tweenCount || tweens[i]!._advance(frameDt, this._paused)) this._tweens.push(tweens[i]!)
    const timers = this._timers
    this._timers = []
    for (let i = 0; i < timers.length; i++) if (i >= timerCount || timers[i]!._advance(frameDt, this._paused)) this._timers.push(timers[i]!)

    this._flushFrameEnd()
    this._updateCamera(frameDt)
  }

  /** 按当前相机更新画面偏移：所有节点移动完、帧末销毁之后，渲染之前。 */
  private _updateCamera(dt: number): void {
    const camera = this._currentCamera
    const viewport = this.viewport
    if (!camera) {
      viewport._canvasX = 0
      viewport._canvasY = 0
      return
    }
    // 暂停时（相机不能处理）平滑不推进；没有平滑的相机照样对准目标（目标只会被不受暂停影响的节点移动）
    camera._step(camera.canProcess() ? dt : 0)
    // 世界坐标 + 偏移 = 设计坐标；画面中心对准设计区域的中心
    viewport._canvasX = viewport.designWidth / 2 - camera._centerX
    viewport._canvasY = viewport.designHeight / 2 - camera._centerY
  }

  /** @internal 当前相机离开树或被关掉后，选树里下一个启用的相机（没有就不偏移）。 */
  _pickCamera(): void {
    this._currentCamera = null
    for (const camera of this._cameras) {
      if (camera.enabled && camera.isInsideTree) {
        camera.makeCurrent()
        return
      }
    }
  }

  /** @internal 清空物理累加器：从后台回来时调用，避免一次补算很多步。 */
  _resetAccumulator(): void {
    this._accumulator = 0
  }

  /** @internal 顶层节点：各个 Autoload，然后是当前场景。渲染层从这里开始遍历。 */
  _topLevel(): readonly Node[] {
    return this._root.children
  }

  /** 树中所有节点（不含内部根节点）的先序快照。 */
  private _snapshot(): Node[] {
    const out: Node[] = []
    for (const child of this._root.children) child._collect(out)
    return out
  }

  // ---------------------------------------------------------------- 调试

  /**
   * 输出场景树当前状态，供调试和 agent 观察。默认是缩进文本，Autoload 在前、当前场景在后：
   *
   * ```
   * GameState (GameState) score=3
   * GameScene (GameScene) position=(0, 0)
   *   Player (Player) position=(100, 200) groups=[players]
   * ```
   *
   * `{ json: true }` 时返回 Autoload 和场景组成的数组。
   */
  dump(options: DumpOptions & { json: true }): DumpNode[]
  dump(options?: DumpOptions): string
  dump(options: DumpOptions = {}): string | DumpNode[] {
    const roots = this._root.children.map((c) => c._dump())
    if (options.json) return roots
    if (roots.length === 0) return '(empty tree)'
    const lines: string[] = []
    const walk = (n: DumpNode, depth: number) => {
      const props = Object.entries(n.props).map(([k, val]) => `${k}=${formatValue(val)}`)
      lines.push(`${'  '.repeat(depth)}${n.name} (${n.type})${props.length ? ' ' + props.join(' ') : ''}`)
      for (const c of n.children) walk(c, depth + 1)
    }
    for (const r of roots) walk(r, 0)
    return lines.join('\n')
  }
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') return fmt(value)
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`
  // 向量 "(x, y)" 原样输出；其他带空白的字符串（比如 Label 的文字）加引号
  if (typeof value === 'string') return /^\(.*\)$/.test(value) || !(/\s/.test(value) || value === '') ? value : JSON.stringify(value)
  return String(value)
}
