import type { Texture } from '../core/assets'
import { Signal } from '../core/Signal'
import { Sprite2D, type Sprite2DOptions } from './Sprite2D'

/** 一套帧动画。 */
export interface SpriteAnimation {
  /** 帧序列，至少一帧。通常来自 `sheet().frames()` 或 `atlas().frames(prefix)`。 */
  frames: readonly Texture[]
  /** 每秒帧数，默认 10。与 `durations` 二选一。 */
  fps?: number
  /** 每一帧显示的秒数（长度和 `frames` 相同，都 > 0），让帧长短不一，例如攻击的前摇停得久、出手帧很短。与 `fps` 二选一。 */
  durations?: readonly number[]
  /** 播到最后一帧后从头循环，默认 true。不循环时停在最后一帧并触发 `animationFinished`。 */
  loop?: boolean
}

export interface AnimatedSprite2DOptions<A extends string = string> extends Omit<Sprite2DOptions, 'texture'> {
  /** 多套动画：名字 → 动画。与 `frames` 二选一。 */
  animations?: Record<A, SpriteAnimation>
  /** 只有一套动画时的简写，等价于 `animations: { default: { frames, fps, durations, loop } }`。 */
  frames?: readonly Texture[]
  fps?: number
  durations?: readonly number[]
  loop?: boolean
  /** 初始动画，默认是第一套。 */
  animation?: NoInfer<A>
  /** 进入树后立即播放，默认 false。 */
  autoplay?: boolean
  /** 播放倍速，默认 1（0 相当于暂停）。 */
  speedScale?: number
}

interface ResolvedAnimation {
  frames: readonly Texture[]
  /** 每帧秒数。 */
  durations: readonly number[]
  /** 每帧开始的时间点，最后多一项是总时长。 */
  starts: readonly number[]
  loop: boolean
}

/**
 * 帧动画精灵：按帧率（或每帧各自的时长）轮流显示一组贴图。继承 Sprite2D，`centered`、`flipH`、`modulate`、`alpha` 等照常可用；
 * `texture` 由动画控制，不要直接赋值。
 *
 * ```ts
 * // 一套动画：爆炸播完就销毁
 * const fx = this.add(new AnimatedSprite2D({ frames: Main.assets.boom.frames(), fps: 16, loop: false, autoplay: true }))
 * fx.animationFinished.connect(() => fx.queueFree(), fx)
 *
 * // 多套动画：名字有类型检查
 * const player = new AnimatedSprite2D({
 *   animations: { idle: { frames: idleFrames, fps: 8 }, hurt: { frames: hurtFrames, fps: 12, loop: false } },
 *   autoplay: true,
 * })
 * player.play('hurt')
 *
 * // 帧长短不一：前摇 0.2 秒，出手帧 0.04 秒
 * const hero = new AnimatedSprite2D({ frames: atkFrames, durations: [0.1, 0.2, 0.04, 0.15], loop: false })
 * ```
 *
 * 按帧时间推进（暂停时停止），无头测试里结果确定。一次推进跨过好几帧时（`speedScale` 很大），每一帧都会触发 `frameChanged`。
 */
export class AnimatedSprite2D<A extends string = string> extends Sprite2D {
  /** 显示的帧变了（播放推进、切换动画、给 `frame` 赋值、stop）。 */
  readonly frameChanged = new Signal()
  /** 不循环的动画播到最后一帧。参数是动画名。 */
  readonly animationFinished = new Signal<[animation: A]>()
  private readonly _animations: ReadonlyMap<A, ResolvedAnimation>
  private _animation: A
  private _frame = 0
  private _elapsed = 0
  private _playing: boolean
  private _finished = false
  private _speedScale: number

  constructor(options: AnimatedSprite2DOptions<A>) {
    super(options)
    if (options.animations && options.frames) throw new Error('AnimatedSprite2D: pass either `animations` or `frames`, not both.')
    const defs: [string, SpriteAnimation][] = options.animations
      ? Object.entries<SpriteAnimation>(options.animations)
      : options.frames
        ? [['default', { frames: options.frames, fps: options.fps, durations: options.durations, loop: options.loop }]]
        : []
    if (!defs.length) throw new Error('AnimatedSprite2D: pass `frames` or `animations`.')
    const map = new Map<A, ResolvedAnimation>()
    for (const [name, def] of defs) map.set(name as A, resolveAnimation(name, def))
    this._animations = map
    this._animation = options.animation ?? (defs[0]![0] as A)
    this._get(this._animation)
    this._playing = options.autoplay ?? false
    this._speedScale = Math.max(0, options.speedScale ?? 1)
    this.texture = this._current.frames[0]!
  }

  /** 当前动画的名字。用 `play(name)` 切换。 */
  get animation(): A {
    return this._animation
  }

  /** 所有动画的名字。 */
  get animationNames(): A[] {
    return [...this._animations.keys()]
  }

  /** 当前帧号（从 0 开始）。赋值会跳到那一帧（超出范围时截断），并从这一帧的开头计时。 */
  get frame(): number {
    return this._frame
  }

  set frame(value: number) {
    this._finished = false
    this._elapsed = 0
    this._show(Math.min(this.frameCount - 1, Math.max(0, Math.floor(value))))
  }

  /** 当前动画的帧数。 */
  get frameCount(): number {
    return this._current.frames.length
  }

  get isPlaying(): boolean {
    return this._playing
  }

  /** 一轮播放的总秒数（不算 `speedScale`）。不传名字时是当前动画。 */
  getAnimationDuration(name: A = this._animation): number {
    const anim = this._get(name)
    return anim.starts[anim.frames.length]!
  }

  /** 第 `frame` 帧开始的时间点（秒，不算 `speedScale`），例如出手帧在攻击动画里的时刻。 */
  getFrameTime(name: A, frame: number): number {
    const anim = this._get(name)
    if (!Number.isInteger(frame) || frame < 0 || frame >= anim.frames.length) {
      throw new Error(`AnimatedSprite2D: frame ${frame} out of range for animation "${name}" (0–${anim.frames.length - 1}).`)
    }
    return anim.starts[frame]!
  }

  /** 播放倍速（≥ 0）。 */
  get speedScale(): number {
    return this._speedScale
  }

  set speedScale(value: number) {
    this._speedScale = Math.max(0, value)
  }

  /**
   * 播放。传入别的动画名时切换过去、从第 0 帧开始；不传或是当前动画时从当前帧继续——
   * 不循环的动画已经播完的话从头再播。
   */
  play(name?: A): void {
    if (name !== undefined && name !== this._animation) {
      this._get(name)
      this._animation = name
      this._elapsed = 0
      this._finished = false
      this._show(0, true)
    } else if (this._finished) {
      this.frame = 0
    }
    this._playing = true
  }

  /** 暂停在当前帧；`play()` 从这里继续。 */
  pause(): void {
    this._playing = false
  }

  /** 停止并回到第 0 帧。 */
  stop(): void {
    this._playing = false
    this.frame = 0
  }

  /** @internal 动画放在引擎内部钩子里：子类覆写 process() 不会影响播放。 */
  override _internalProcess(dt: number): void {
    if (!this._playing) return
    const anim = this._current
    const durations = anim.durations
    this._elapsed += dt * this._speedScale
    while (this._playing && this._elapsed >= durations[this._frame]! - EPSILON) {
      this._elapsed -= durations[this._frame]!
      if (this._frame + 1 < anim.frames.length) this._show(this._frame + 1)
      else if (anim.loop) this._show(0)
      else {
        this._playing = false
        this._finished = true
        this._elapsed = 0
        this.animationFinished.emit(this._animation)
      }
    }
  }

  private get _current(): ResolvedAnimation {
    return this._animations.get(this._animation)!
  }

  private _get(name: A): ResolvedAnimation {
    const anim = this._animations.get(name)
    if (!anim) throw new Error(`AnimatedSprite2D: unknown animation "${name}". Animations: ${this.animationNames.join(', ')}.`)
    return anim
  }

  private _show(index: number, force = false): void {
    if (index === this._frame && !force) return
    this._frame = index
    this.texture = this._current.frames[index]!
    this.frameChanged.emit()
  }

  protected override dumpProps(): Record<string, unknown> {
    return {
      ...super.dumpProps(),
      animation: this._animations.size > 1 ? this._animation : undefined,
      frame: this._frame,
      playing: this._playing || undefined,
    }
  }
}

const EPSILON = 1e-9

function resolveAnimation(name: string, def: SpriteAnimation): ResolvedAnimation {
  const n = def.frames.length
  if (!n) throw new Error(`AnimatedSprite2D: animation "${name}" has no frames.`)
  let durations: number[]
  if (def.durations) {
    if (def.fps !== undefined) throw new Error(`AnimatedSprite2D: animation "${name}": pass either \`fps\` or \`durations\`, not both.`)
    if (def.durations.length !== n) {
      throw new Error(`AnimatedSprite2D: animation "${name}" has ${n} frames but ${def.durations.length} durations.`)
    }
    durations = [...def.durations]
    const bad = durations.findIndex((d) => !(d > 0 && Number.isFinite(d)))
    if (bad >= 0) throw new Error(`AnimatedSprite2D: animation "${name}" duration of frame ${bad} must be > 0, got ${durations[bad]}.`)
  } else {
    const fps = def.fps ?? 10
    if (!(fps > 0)) throw new Error(`AnimatedSprite2D: animation "${name}" fps must be > 0, got ${fps}.`)
    durations = new Array<number>(n).fill(1 / fps)
  }
  const starts = [0]
  for (let i = 0; i < n; i++) starts.push(starts[i]! + durations[i]!)
  return { frames: [...def.frames], durations, starts, loop: def.loop ?? true }
}
