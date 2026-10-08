import type { Texture } from '../core/assets'
import { Signal } from '../core/Signal'
import { Sprite2D, type Sprite2DOptions } from './Sprite2D'

/** 一套帧动画。 */
export interface SpriteAnimation {
  /** 帧序列，至少一帧。通常来自 `sheet().frames()` 或 `atlas().frames(prefix)`。 */
  frames: readonly Texture[]
  /** 每秒帧数，默认 10。 */
  fps?: number
  /** 播到最后一帧后从头循环，默认 true。不循环时停在最后一帧并触发 `animationFinished`。 */
  loop?: boolean
}

export interface AnimatedSprite2DOptions<A extends string = string> extends Omit<Sprite2DOptions, 'texture'> {
  /** 多套动画：名字 → 动画。与 `frames` 二选一。 */
  animations?: Record<A, SpriteAnimation>
  /** 只有一套动画时的简写，等价于 `animations: { default: { frames, fps, loop } }`。 */
  frames?: readonly Texture[]
  fps?: number
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
  fps: number
  loop: boolean
}

/**
 * 帧动画精灵：按固定帧率轮流显示一组贴图。继承 Sprite2D，`centered`、`flipH`、`modulate`、`alpha` 等照常可用；
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
 * ```
 *
 * 按帧时间推进（暂停时停止），无头测试里结果确定。
 */
export class AnimatedSprite2D<A extends string = string> extends Sprite2D {
  /** 显示的帧变了（播放推进、切换动画、给 `frame` 赋值、stop）。 */
  readonly frameChanged = new Signal()
  /** 不循环的动画播到最后一帧。参数是动画名。 */
  readonly animationFinished = new Signal<[animation: A]>()
  readonly #animations: ReadonlyMap<A, ResolvedAnimation>
  #animation: A
  #frame = 0
  #elapsed = 0
  #playing: boolean
  #finished = false
  #speedScale: number

  constructor(options: AnimatedSprite2DOptions<A>) {
    super(options)
    if (options.animations && options.frames) throw new Error('AnimatedSprite2D: pass either `animations` or `frames`, not both.')
    const defs: [string, SpriteAnimation][] = options.animations
      ? Object.entries<SpriteAnimation>(options.animations)
      : options.frames
        ? [['default', { frames: options.frames, fps: options.fps, loop: options.loop }]]
        : []
    if (!defs.length) throw new Error('AnimatedSprite2D: pass `frames` or `animations`.')
    const map = new Map<A, ResolvedAnimation>()
    for (const [name, def] of defs) {
      const fps = def.fps ?? 10
      if (!def.frames.length) throw new Error(`AnimatedSprite2D: animation "${name}" has no frames.`)
      if (!(fps > 0)) throw new Error(`AnimatedSprite2D: animation "${name}" fps must be > 0, got ${fps}.`)
      map.set(name as A, { frames: [...def.frames], fps, loop: def.loop ?? true })
    }
    this.#animations = map
    this.#animation = options.animation ?? (defs[0]![0] as A)
    this.#resolve(this.#animation)
    this.#playing = options.autoplay ?? false
    this.#speedScale = Math.max(0, options.speedScale ?? 1)
    this.texture = this.#current.frames[0]!
  }

  /** 当前动画的名字。用 `play(name)` 切换。 */
  get animation(): A {
    return this.#animation
  }

  /** 所有动画的名字。 */
  get animationNames(): A[] {
    return [...this.#animations.keys()]
  }

  /** 当前帧号（从 0 开始）。赋值会跳到那一帧（超出范围时截断），并从这一帧的开头计时。 */
  get frame(): number {
    return this.#frame
  }

  set frame(value: number) {
    this.#finished = false
    this.#elapsed = 0
    this.#show(Math.min(this.frameCount - 1, Math.max(0, Math.floor(value))))
  }

  /** 当前动画的帧数。 */
  get frameCount(): number {
    return this.#current.frames.length
  }

  get isPlaying(): boolean {
    return this.#playing
  }

  /** 播放倍速（≥ 0）。 */
  get speedScale(): number {
    return this.#speedScale
  }

  set speedScale(value: number) {
    this.#speedScale = Math.max(0, value)
  }

  /**
   * 播放。传入别的动画名时切换过去、从第 0 帧开始；不传或是当前动画时从当前帧继续——
   * 不循环的动画已经播完的话从头再播。
   */
  play(name?: A): void {
    if (name !== undefined && name !== this.#animation) {
      this.#resolve(name)
      this.#animation = name
      this.#elapsed = 0
      this.#finished = false
      this.#show(0, true)
    } else if (this.#finished) {
      this.frame = 0
    }
    this.#playing = true
  }

  /** 暂停在当前帧；`play()` 从这里继续。 */
  pause(): void {
    this.#playing = false
  }

  /** 停止并回到第 0 帧。 */
  stop(): void {
    this.#playing = false
    this.frame = 0
  }

  /** @internal 动画放在引擎内部钩子里：子类覆写 process() 不会影响播放。 */
  override _internalProcess(dt: number): void {
    if (!this.#playing) return
    const anim = this.#current
    const spf = 1 / anim.fps
    this.#elapsed += dt * this.#speedScale
    while (this.#playing && this.#elapsed >= spf - EPSILON) {
      this.#elapsed -= spf
      if (this.#frame + 1 < anim.frames.length) this.#show(this.#frame + 1)
      else if (anim.loop) this.#show(0)
      else {
        this.#playing = false
        this.#finished = true
        this.#elapsed = 0
        this.animationFinished.emit(this.#animation)
      }
    }
  }

  get #current(): ResolvedAnimation {
    return this.#animations.get(this.#animation)!
  }

  #resolve(name: A): void {
    if (!this.#animations.has(name)) {
      throw new Error(`AnimatedSprite2D: unknown animation "${name}". Animations: ${this.animationNames.join(', ')}.`)
    }
  }

  #show(index: number, force = false): void {
    if (index === this.#frame && !force) return
    this.#frame = index
    this.texture = this.#current.frames[index]!
    this.frameChanged.emit()
  }

  protected override dumpProps(): Record<string, unknown> {
    return {
      ...super.dumpProps(),
      animation: this.#animations.size > 1 ? this.#animation : undefined,
      frame: this.#frame,
      playing: this.#playing || undefined,
    }
  }
}

const EPSILON = 1e-9
