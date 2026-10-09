import type { HeadlessAudioBackend } from '../audio/HeadlessAudio'
import type { DumpNode } from '../core/Node'
import type { Scene } from '../core/Scene'
import type { ScreenInfo } from '../core/Viewport'
import { Vector2 } from '../math/Vector2'
import { SceneTree, type DumpOptions } from '../core/SceneTree'
import { HeadlessPlatform } from '../platform/HeadlessPlatform'
import { Game, type GameOptions } from '../runtime/Game'

export interface TestGameOptions<S extends Scene> extends GameOptions<S> {
  /** 模拟的屏幕。默认与设计分辨率相同、DPR 为 1。 */
  screen?: ScreenInfo
  /** 预置的存储数据（不含前缀），比如 `{ highScore: 100 }`，用来测试“已有存档”的情况。 */
  storage?: Record<string, unknown>
  /**
   * 资源目录，文本资源（`tiledMap()` 的关卡文件等）从这里读真实文件；相对路径相对于当前工作目录。默认 `public/assets`。
   * 图片和声音在无头模式下不读文件。
   */
  assetsDir?: string
}

export interface TestGame<S extends Scene> {
  readonly game: Game<S>
  readonly tree: SceneTree
  /** 当前场景实例。 */
  readonly scene: S
  readonly platform: HeadlessPlatform
  /** 无头音频：`g.audio.log` 是播放过的所有声音，`g.audio.finishAll()` 模拟播放结束。 */
  readonly audio: HeadlessAudioBackend
  /** 推进 n 帧（默认 1）。每帧 1/60 秒，恰好包含一次物理步和一次 process。 */
  step(frames?: number): void
  /** 推进指定的秒数（按帧取整）。 */
  stepSeconds(seconds: number): void
  /** 模拟屏幕变化（旋转、窗口缩放、换设备）。 */
  setScreen(screen: ScreenInfo): void
  /** 模拟切到后台（false）/ 回到前台（true）。默认设置下，后台期间 step() 不推进任何东西。 */
  setFocus(focused: boolean): void

  // 输入。坐标都是设计坐标，内部换算成窗口坐标后注入，与真实平台走同一条路径。
  // 注入的事件在下一次 step 开始时处理。

  /** 点击：按下，推进 1 帧，抬起，再推进 1 帧。返回时点击已完整生效（共推进 2 帧）。 */
  tap(x: number, y: number, pointerId?: number): void
  /** 拖拽：在 from 按下，用 `frames` 帧（默认 10）匀速移动到 to，抬起。共推进 frames + 2 帧。 */
  drag(from: Vector2, to: Vector2, options?: { frames?: number; pointerId?: number }): void
  /** 只注入按下（不推进时间）。 */
  pointerDown(x: number, y: number, pointerId?: number): void
  /** 只注入移动（不推进时间）。 */
  pointerMove(x: number, y: number, pointerId?: number): void
  /** 只注入抬起（不推进时间）。 */
  pointerUp(x: number, y: number, pointerId?: number): void
  /** 按一下键：按下，推进 1 帧，松开，再推进 1 帧。 */
  pressKey(code: string): void
  /** 只注入按键按下 / 松开（不推进时间）。 */
  keyDown(code: string): void
  keyUp(code: string): void
  /** 场景树的文本转储；`{ json: true }` 时返回结构化数据。 */
  dump(options: DumpOptions & { json: true }): DumpNode[]
  dump(options?: DumpOptions): string
}

/**
 * 在无头模式下启动游戏：不渲染，时间完全由 `step()` 驱动，结果是确定的。
 * 入口场景的 `static assets` 会被“加载”（无头模式不读文件，贴图宽高为 0）。
 *
 * ```ts
 * const g = await createTestGame({ main: GameScene, seed: 1 })
 * g.step(120)
 * console.log(g.dump())
 * ```
 */
/** 用 Node 的文件系统读文本（动态导入：引擎核心的类型检查不含 Node 类型）。相对路径相对于当前工作目录。 */
async function readNodeFile(path: string): Promise<string> {
  const fs = (await import('node:fs/promises' as string)) as { readFile(path: string, encoding: 'utf8'): Promise<string> }
  return fs.readFile(path, 'utf8')
}

export async function createTestGame<S extends Scene>(options: TestGameOptions<S>): Promise<TestGame<S>> {
  const design = options.design ?? { width: 750, height: 1334 }
  const assetsDir = (options.assetsDir ?? 'public/assets').replace(/\/+$/, '')
  const platform = new HeadlessPlatform(options.screen ?? { width: design.width, height: design.height, pixelRatio: 1 }, (path) => readNodeFile(`${assetsDir}/${path}`))
  const prefix = options.storagePrefix ?? 'sapling2d:'
  for (const [k, value] of Object.entries(options.storage ?? {})) platform.storage.setItem(prefix + k, JSON.stringify(value))
  const game = await Game.create({ ...options, seed: options.seed ?? 1, platform })
  const tree = game.tree

  const frameMs = 1000 / SceneTree.PHYSICS_TICKS_PER_SECOND
  const step = (frames = 1) => {
    for (let i = 0; i < frames; i++) {
      platform.advance(frameMs)
      game.frame(tree.physicsDelta)
    }
  }

  const pointer = (type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number, pointerId = 1) => {
    const p = tree.viewport.designToScreen(new Vector2(x, y))
    platform.injectInput({ type, pointerId, x: p.x, y: p.y })
  }
  const pointerDown = (x: number, y: number, id?: number) => pointer('pointerdown', x, y, id)
  const pointerMove = (x: number, y: number, id?: number) => pointer('pointermove', x, y, id)
  const pointerUp = (x: number, y: number, id?: number) => pointer('pointerup', x, y, id)
  const keyDown = (code: string) => platform.injectInput({ type: 'keydown', code })
  const keyUp = (code: string) => platform.injectInput({ type: 'keyup', code })

  return {
    game,
    pointerDown,
    pointerMove,
    pointerUp,
    keyDown,
    keyUp,
    tap(x, y, pointerId) {
      pointerDown(x, y, pointerId)
      step()
      pointerUp(x, y, pointerId)
      step()
    },
    drag(from, to, opts = {}) {
      const frames = Math.max(1, opts.frames ?? 10)
      pointerDown(from.x, from.y, opts.pointerId)
      step()
      for (let i = 1; i <= frames; i++) {
        const p = from.lerp(to, i / frames)
        pointerMove(p.x, p.y, opts.pointerId)
        step()
      }
      pointerUp(to.x, to.y, opts.pointerId)
      step()
    },
    pressKey(code) {
      keyDown(code)
      step()
      keyUp(code)
      step()
    },
    tree,
    get scene() {
      return game.scene
    },
    platform,
    audio: platform.audio,
    step,
    stepSeconds: (seconds: number) => step(Math.round(seconds * SceneTree.PHYSICS_TICKS_PER_SECOND)),
    setScreen: (screen: ScreenInfo) => platform.setScreen(screen),
    setFocus: (focused: boolean) => platform.setFocus(focused),
    dump: ((opts?: DumpOptions) => tree.dump(opts)) as TestGame<S>['dump'],
  }
}
