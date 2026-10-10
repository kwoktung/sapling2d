import { Rect2 } from '../math/Rect2'
import { Vector2 } from '../math/Vector2'
import type { SpriteAnimation } from '../nodes/AnimatedSprite2D'
import { atlasEntries, atlasFrame, frameRange, tex, Texture, type AtlasFrameData } from './assets'

/** Aseprite 导出的一帧：图集格式加上这一帧的显示时长（毫秒）。 */
export interface AsepriteFrameData extends AtlasFrameData {
  duration?: number
}

/** Aseprite 的 tag（`--list-tags`）：一段动画。`repeat` 是播放次数，导出成字符串，没有或 0 表示一直循环。 */
export interface AsepriteTagData {
  name: string
  from: number
  to: number
  direction?: string
  repeat?: string | number
}

/** Aseprite 的 slice（`--list-slices`）：每个 key 从它的帧开始生效，直到下一个 key。`pivot` 相对 `bounds` 的左上角。 */
export interface AsepriteSliceData {
  name: string
  keys: { frame: number; bounds: { x: number; y: number; w: number; h: number }; pivot?: { x: number; y: number } }[]
}

/** Aseprite 导出的 JSON（`--format json-array` 或 `json-hash`）。 */
export interface AsepriteData {
  frames: Record<string, AsepriteFrameData> | (AsepriteFrameData & { filename: string })[]
  meta?: { image?: string; frameTags?: AsepriteTagData[]; slices?: AsepriteSliceData[] }
}

/** slice 在某一帧的位置。坐标以精灵中心为原点（和默认 `centered` 的 Sprite2D 一致），可以直接加到精灵的 position 上。 */
export interface AsepriteSliceKey {
  readonly bounds: Rect2
  /** Aseprite 里设置的 pivot；没设置时为 null。 */
  readonly pivot: Vector2 | null
}

/** 覆盖 tag 自带的设置。 */
export interface AsepriteAnimationOptions {
  /** 是否循环。默认看 tag：没有设置播放次数时循环，设置了就不循环。 */
  loop?: boolean
}

const DIRECTIONS = ['forward', 'reverse', 'pingpong', 'pingpong_reverse']

/**
 * Aseprite 导出的精灵：用 `aseprite(path, data)` 创建，`data` 是 Aseprite 导出的 JSON（直接 import 进代码）。
 * 帧按导出顺序编号（从 0 开始）；tag 变成动画（每帧时长来自 Aseprite），slice 是挂点。
 *
 * ```ts
 * import heroData from './hero.json'
 * static assets = { hero: aseprite<'idle' | 'attack'>('hero.png', heroData) }
 * new AnimatedSprite2D({ animations: Main.assets.hero.animations({ attack: { loop: false } }), autoplay: true })
 * ```
 */
export class AsepriteSheet<A extends string = string> {
  readonly kind = 'aseprite'
  private readonly _frames: Texture[]
  private readonly _index: Map<Texture, number>
  private readonly _durations: number[]
  private readonly _tags: Map<string, AsepriteTagData> | null
  private readonly _slices: Map<string, (AsepriteSliceKey | null)[]> | null
  private readonly _who: string

  /** @internal 请使用 aseprite()。 */
  constructor(
    /** 整张图。 */
    readonly texture: Texture,
    data: AsepriteData,
  ) {
    const who = (this._who = `aseprite('${texture.path}')`)
    const entries = atlasEntries(data)
    if (!entries.length) throw new Error(`${who}: the JSON has no frames.`)
    const frames = entries.map(([name, f]) => atlasFrame(who, name, f))
    this._frames = frames.map((frame, i) => new Texture(`${texture.path}#${i}`, texture, () => frame))
    this._index = new Map(this._frames.map((t, i) => [t, i]))
    this._durations = entries.map(([, f]) => (f.duration ?? 100) / 1000)
    const bad = this._durations.findIndex((d) => !(d > 0 && Number.isFinite(d)))
    if (bad >= 0) throw new Error(`${who}: frame ${bad} has duration ${entries[bad]![1].duration}; it must be > 0.`)

    const tags = data.meta?.frameTags
    this._tags = tags ? new Map() : null
    for (const tag of tags ?? []) {
      if (!(tag.from >= 0 && tag.to >= tag.from && tag.to < frames.length)) {
        throw new Error(`${who}: tag "${tag.name}" covers frames ${tag.from}–${tag.to}, but there are ${frames.length} frames.`)
      }
      if (!DIRECTIONS.includes(tag.direction ?? 'forward')) {
        throw new Error(`${who}: tag "${tag.name}" has unknown direction "${tag.direction}". Expected: ${DIRECTIONS.join(', ')}.`)
      }
      if (this._tags!.has(tag.name)) throw new Error(`${who}: two tags are named "${tag.name}". Rename one in Aseprite.`)
      this._tags!.set(tag.name, tag)
    }

    // 每个 slice 按帧号预先算好（同一个 key 覆盖的帧共用一个对象），查询时不分配
    const slices = data.meta?.slices
    this._slices = slices ? new Map() : null
    for (const slice of slices ?? []) {
      const byFrame: (AsepriteSliceKey | null)[] = new Array<AsepriteSliceKey | null>(frames.length).fill(null)
      const keys = [...slice.keys].sort((a, b) => a.frame - b.frame)
      keys.forEach((k, i) => {
        const { x, y, w, h } = k.bounds
        // 以这个 key 所在帧的画布中心为原点（一个 Aseprite 文件的帧通常一样大，但图集可能合并了几个文件）
        const canvas = frames[Math.min(Math.max(0, k.frame), frames.length - 1)]!
        const cx = canvas.width / 2
        const cy = canvas.height / 2
        const key: AsepriteSliceKey = {
          bounds: new Rect2(x - cx, y - cy, w, h),
          pivot: k.pivot ? new Vector2(x + k.pivot.x - cx, y + k.pivot.y - cy) : null,
        }
        const end = Math.min(keys[i + 1]?.frame ?? frames.length, frames.length)
        for (let f = Math.max(0, k.frame); f < end; f++) byFrame[f] = key
      })
      this._slices!.set(slice.name, byFrame)
    }
  }

  /** 帧数。 */
  get count(): number {
    return this._frames.length
  }

  get isLoaded(): boolean {
    return this.texture.isLoaded
  }

  /** 所有 tag 的名字（按 JSON 中的顺序）。 */
  get tags(): string[] {
    return this._tags ? [...this._tags.keys()] : []
  }

  /** 所有 slice 的名字。 */
  get sliceNames(): string[] {
    return this._slices ? [...this._slices.keys()] : []
  }

  /** 第 `index` 帧（从 0 开始）。 */
  frame(index: number): Texture {
    const t = this._frames[index]
    if (!t) throw new Error(`${this._who}: frame ${index} is out of range (0–${this.count - 1}).`)
    return t
  }

  /** 第 `start` 到第 `end` 帧（都包含）；不传参数时是全部帧。 */
  frames(start = 0, end = this.count - 1): Texture[] {
    return frameRange(this._who, start, end, (i) => this.frame(i))
  }

  /** 第 `index` 帧在 Aseprite 里的显示时长（秒）。 */
  duration(index: number): number {
    this.frame(index)
    return this._durations[index]!
  }

  /**
   * 一个 tag 对应的动画（`frames` + `durations`），可以直接放进 `AnimatedSprite2D` 的 `animations`。
   * 播放方向（reverse / pingpong）和播放次数展开成帧序列。不传名字时是全部帧，按顺序循环。
   */
  animation(name?: A, options: AsepriteAnimationOptions = {}): SpriteAnimation {
    if (name === undefined) {
      return { frames: [...this._frames], durations: [...this._durations], loop: options.loop ?? true }
    }
    const tag = this._tag(name)
    const repeat = Number(tag.repeat ?? 0)
    const finite = repeat > 0
    const loop = options.loop ?? !finite
    const dir = tag.direction ?? 'forward'
    const pingpong = dir === 'pingpong' || dir === 'pingpong_reverse'
    const up: number[] = []
    for (let i = tag.from; i <= tag.to; i++) up.push(i)
    const down = [...up].reverse()
    const [first, second] = dir === 'forward' || dir === 'pingpong' ? [up, down] : [down, up]
    let seq: number[]
    if (loop) {
      // 循环的一轮：pingpong 往回走时不重复两端（两端在下一轮里接上）
      seq = pingpong ? [...first, ...second.slice(1, -1)] : first
    } else {
      // 播放次数：pingpong 每走一趟算一次，后一趟从前一趟的终点之后接着走；没设置次数却要求不循环时，pingpong 走一个来回
      const passes = finite ? repeat : pingpong ? 2 : 1
      seq = [...first]
      for (let p = 1; p < passes; p++) seq.push(...(pingpong ? (p % 2 ? second : first).slice(1) : first))
    }
    return { frames: seq.map((i) => this._frames[i]!), durations: seq.map((i) => this._durations[i]!), loop }
  }

  /** 所有 tag 的动画：名字 → 动画。`options` 按名字覆盖设置，例如 `{ attack: { loop: false } }`。 */
  animations(options: Partial<Record<A, AsepriteAnimationOptions>> = {}): Record<A, SpriteAnimation> {
    if (!this._tags) throw this._missing('frameTags', '--list-tags')
    if (!this._tags.size) throw new Error(`${this._who}: the file has no tags. Add tags in Aseprite, or use animation() for all frames.`)
    for (const name of Object.keys(options)) this._tag(name as A)
    const out = {} as Record<A, SpriteAnimation>
    for (const name of this._tags.keys()) out[name as A] = this.animation(name as A, options[name as A])
    return out
  }

  /**
   * slice `name` 在某一帧的位置（例如枪口、剑尖，特效从这里发出），坐标以精灵中心为原点。
   * `frame` 是这张图里的帧号，或者这张图的一帧贴图——播放中的精灵直接传 `sprite.texture`
   * （`sprite.frame` 是在当前动画里的序号，不是这张图里的帧号）。
   * 这一帧之前还没有 key 时返回 null。返回的对象是共用的，不要修改。精灵 `flipH` 时把 x 取反。
   */
  slice(name: string, frame: number | Texture | null): AsepriteSliceKey | null {
    if (!this._slices) throw this._missing('slices', '--list-slices')
    const byFrame = this._slices.get(name)
    if (!byFrame) throw new Error(`${this._who}: no slice named "${name}". Slices: ${this.sliceNames.join(', ') || '(none)'}.`)
    let index: number
    if (typeof frame === 'number') {
      this.frame(frame)
      index = frame
    } else {
      const i = frame ? this._index.get(frame) : undefined
      if (i === undefined) throw new Error(`${this._who}: texture "${frame?.path ?? null}" is not a frame of this sprite.`)
      index = i
    }
    return byFrame[index]!
  }

  /** @internal */
  _unload(): void {
    this.texture._unload()
  }

  private _tag(name: A): AsepriteTagData {
    if (!this._tags) throw this._missing('frameTags', '--list-tags')
    const tag = this._tags.get(name)
    if (!tag) throw new Error(`${this._who}: no tag named "${name}". Tags: ${this.tags.join(', ') || '(none)'}.`)
    return tag
  }

  private _missing(field: string, flag: string): Error {
    return new Error(`${this._who}: the JSON has no meta.${field}. Export from Aseprite with ${flag}.`)
  }
}

/**
 * Aseprite 导出的精灵：`path` 是导出的图片（相对于资源目录），`data` 是导出的 JSON。
 * 类型参数 `A` 是 tag 的名字（JSON 里推断不出来），只用于类型检查：用到不存在的 tag 时运行时报错。
 */
export function aseprite<A extends string = string>(path: string, data: AsepriteData): AsepriteSheet<A> {
  return new AsepriteSheet<A>(tex(path), data)
}
