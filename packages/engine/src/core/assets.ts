import type { AudioServer } from '../audio/AudioServer'
import { AudioStream } from '../audio/AudioStream'
import { Rect2 } from '../math/Rect2'
import { Vector2 } from '../math/Vector2'
import type { Platform } from '../platform/Platform'

/**
 * 贴图资源句柄。用 `tex(path)` 创建，路径相对于游戏的资源目录（默认 `assets/`）。
 * 同一路径永远返回同一个句柄，所以可以在任何地方引用：
 *
 * ```ts
 * class GameScene extends Scene {
 *   static assets = { fruit: tex('fruit.png') }   // 进入场景前加载完成
 *   override ready() {
 *     this.add(new Sprite2D({ texture: GameScene.assets.fruit }))
 *   }
 * }
 * ```
 *
 * 也可以是一张大图里的子区域（图集的一帧）：由 `sheet()` / `atlas()` 切出，用法和整张图完全相同。
 */
export class Texture {
  readonly kind = 'texture'
  #width = 0
  #height = 0
  #loaded = false
  #resource: unknown = null
  /** @internal 子区域所在的整张图；整张图自己为 null。 */
  readonly _base: Texture | null
  readonly #frame: (() => TextureFrame) | null

  /** @internal 请使用 tex(path)、sheet() 或 atlas()。 */
  constructor(path: string)
  /** @internal 子区域：`frame` 在用到时才计算（网格切片要等整张图加载后才知道尺寸）。 */
  constructor(path: string, base: Texture, frame: () => TextureFrame)
  constructor(
    readonly path: string,
    base?: Texture,
    frame?: () => TextureFrame,
  ) {
    this._base = base ?? null
    this.#frame = frame ?? null
  }

  /** 宽度（像素）：整张图的原始宽度，或子区域裁剪前的宽度；未加载或无头模式下整张图为 0。 */
  get width(): number {
    return this.#frame ? this.#frame().width : this.#width
  }

  get height(): number {
    return this.#frame ? this.#frame().height : this.#height
  }

  get isLoaded(): boolean {
    return this._base ? this._base.isLoaded : this.#loaded
  }

  /** @internal 平台加载出的原始图片对象（浏览器是 HTMLImageElement，小游戏是 wx Image）；子区域返回整张图的。 */
  get _resource(): unknown {
    return this._base ? this._base._resource : this.#resource
  }

  /** @internal 子区域在整张图里的位置；整张图为 null。 */
  get _frame(): TextureFrame | null {
    return this.#frame ? this.#frame() : null
  }

  /** @internal */
  _setLoaded(resource: unknown, width: number, height: number): void {
    if (this._base) return this._base._setLoaded(resource, width, height)
    this.#resource = resource
    this.#width = width
    this.#height = height
    this.#loaded = true
  }

  /** @internal 释放图片；再次用到时需要重新加载。 */
  _unload(): void {
    if (this._base) return this._base._unload()
    this.#resource = null
    this.#loaded = false
  }
}

/** @internal 子区域：`region` 是它在整张图里的矩形；`width` / `height` 是裁剪前的原始尺寸，`trim` 是 region 在原始尺寸里的偏移（图集打包时裁掉了透明边）。 */
export interface TextureFrame {
  region: Rect2
  width: number
  height: number
  trim: Vector2 | null
}

const textureCache = new Map<string, Texture>()

/** 声明一张贴图。同一路径返回同一个句柄。 */
export function tex(path: string): Texture {
  let t = textureCache.get(path)
  if (!t) {
    t = new Texture(path)
    textureCache.set(path, t)
  }
  return t
}

// ---------------------------------------------------------------- 图集

/**
 * 网格图集：一张大图按等大的格子切成多帧（从左到右、从上到下编号，从 0 开始）。用 `sheet(path, { columns, rows })` 创建。
 *
 * ```ts
 * static assets = { boom: sheet('explosion.png', { columns: 4, rows: 2 }) }
 * new AnimatedSprite2D({ frames: Main.assets.boom.frames(), fps: 16, loop: false })
 * ```
 *
 * 每帧的尺寸 = 整张图的尺寸 / 列数（行数），在图片加载后才确定；无头模式下为 0。
 */
export class SpriteSheet {
  readonly kind = 'spritesheet'
  readonly #frames: Texture[]

  /** @internal 请使用 sheet()。 */
  constructor(
    /** 整张图。 */
    readonly texture: Texture,
    readonly columns: number,
    readonly rows: number,
  ) {
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
      throw new Error(`sheet('${texture.path}'): columns and rows must be positive integers (got ${columns}×${rows}).`)
    }
    this.#frames = Array.from({ length: columns * rows }, (_, i) => {
      const col = i % columns
      const row = Math.floor(i / columns)
      return new Texture(`${texture.path}#${i}`, texture, () => {
        const w = texture.width / columns
        const h = texture.height / rows
        return { region: new Rect2(col * w, row * h, w, h), width: w, height: h, trim: null }
      })
    })
  }

  /** 帧数（列数 × 行数）。 */
  get count(): number {
    return this.#frames.length
  }

  get isLoaded(): boolean {
    return this.texture.isLoaded
  }

  /** 第 `index` 帧（从 0 开始）。 */
  frame(index: number): Texture {
    const t = this.#frames[index]
    if (!t) throw new Error(`sheet('${this.texture.path}'): frame ${index} is out of range (0–${this.count - 1}).`)
    return t
  }

  /** 第 `start` 到第 `end` 帧（都包含）；不传参数时是全部帧。 */
  frames(start = 0, end = this.count - 1): Texture[] {
    const out: Texture[] = []
    for (let i = start; i <= end; i++) out.push(this.frame(i))
    return out
  }

  /** @internal */
  _unload(): void {
    this.texture._unload()
  }
}

/** 图集 JSON 里的一帧（TexturePacker 等工具导出的 “JSON Hash” / “JSON Array” 格式，Pixi 使用的也是这种格式）。 */
export interface AtlasFrameData {
  frame: { x: number; y: number; w: number; h: number }
  rotated?: boolean
  trimmed?: boolean
  spriteSourceSize?: { x: number; y: number; w: number; h: number }
  sourceSize?: { w: number; h: number }
}

/** 图集 JSON：`frames` 是 名字 → 帧（JSON Hash），或带 `filename` 的帧数组（JSON Array）。 */
export interface AtlasData {
  frames: Record<string, AtlasFrameData> | (AtlasFrameData & { filename: string })[]
  meta?: { image?: string }
}

/**
 * 打包图集：很多张大小不一的小图打包在一张大图里，每张小图有名字。用 `atlas(path, data)` 创建，
 * `data` 是打包工具导出的 JSON（直接 import 进代码）：
 *
 * ```ts
 * import spritesData from './sprites.json'
 * static assets = { sprites: atlas('sprites.png', spritesData) }
 * new Sprite2D({ texture: Main.assets.sprites.get('enemy_red') })
 * new AnimatedSprite2D({ frames: Main.assets.sprites.frames('explosion_'), fps: 16 })
 * ```
 *
 * 帧的尺寸来自 JSON，无头模式下也正确。不支持旋转打包（导出时关闭 “Allow rotation”）。
 */
export class Atlas {
  readonly kind = 'atlas'
  readonly #frames = new Map<string, Texture>()

  /** @internal 请使用 atlas()。 */
  constructor(
    /** 整张图。 */
    readonly texture: Texture,
    data: AtlasData,
  ) {
    const entries: [string, AtlasFrameData][] = Array.isArray(data.frames) ? data.frames.map((f) => [f.filename, f]) : Object.entries(data.frames)
    for (const [name, f] of entries) {
      if (f.rotated) throw new Error(`atlas('${texture.path}'): frame "${name}" is rotated. Export the atlas with rotation disabled.`)
      const { x, y, w, h } = f.frame
      const src = f.trimmed ? f.spriteSourceSize : undefined
      const frame: TextureFrame = {
        region: new Rect2(x, y, w, h),
        width: src ? (f.sourceSize?.w ?? w) : w,
        height: src ? (f.sourceSize?.h ?? h) : h,
        trim: src ? new Vector2(src.x, src.y) : null,
      }
      this.#frames.set(name, new Texture(`${texture.path}#${name}`, texture, () => frame))
    }
  }

  /** 所有帧的名字（按 JSON 中的顺序）。 */
  get names(): string[] {
    return [...this.#frames.keys()]
  }

  get isLoaded(): boolean {
    return this.texture.isLoaded
  }

  has(name: string): boolean {
    return this.#frames.has(name)
  }

  /** 按名字取一帧。名字不存在时报错，并列出最相近的名字。 */
  get(name: string): Texture {
    const t = this.#frames.get(name)
    if (t) return t
    const similar = this.names.filter((n) => n.includes(name) || name.includes(n)).slice(0, 5)
    throw new Error(`atlas('${this.texture.path}'): no frame named "${name}".` + (similar.length ? ` Similar: ${similar.join(', ')}.` : ` Frames: ${this.names.slice(0, 10).join(', ')}${this.#frames.size > 10 ? ', …' : ''}.`))
  }

  /**
   * 名字以 `prefix` 开头的所有帧，按名字里的数字自然排序（`run_2` 在 `run_10` 之前）。
   * 用来取一段动画：`frames('explosion_')`。一帧都没有时报错。
   */
  frames(prefix: string): Texture[] {
    const names = this.names.filter((n) => n.startsWith(prefix)).sort(naturalCompare)
    if (!names.length) throw new Error(`atlas('${this.texture.path}'): no frames start with "${prefix}".`)
    return names.map((n) => this.#frames.get(n)!)
  }

  /** @internal */
  _unload(): void {
    this.texture._unload()
  }
}

/** 网格图集：把 `path` 这张图切成 `columns` × `rows` 个等大的格子。路径相对于资源目录。 */
export function sheet(path: string, grid: { columns: number; rows: number }): SpriteSheet {
  return new SpriteSheet(tex(path), grid.columns, grid.rows)
}

/** 打包图集：`path` 是图集图片（相对于资源目录），`data` 是打包工具导出的 JSON。 */
export function atlas(path: string, data: AtlasData): Atlas {
  return new Atlas(tex(path), data)
}

/** 字符串比较，其中的数字按数值比较。 */
function naturalCompare(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g
  const pa = a.match(re) ?? []
  const pb = b.match(re) ?? []
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const x = pa[i]!
    const y = pb[i]!
    if (x === y) continue
    const nx = Number(x)
    const ny = Number(y)
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) return nx - ny
    return x < y ? -1 : 1
  }
  return pa.length - pb.length
}

// ---------------------------------------------------------------- 加载

/** 场景的 `static assets` 声明：贴图（tex）、图集（sheet / atlas）、音效（sfx）、音乐（music）。 */
export type AssetMap = Record<string, Texture | SpriteSheet | Atlas | AudioStream>

/** @internal 资源实际要加载 / 卸载的对象：图集和子区域归结到整张图。 */
export function assetRoot(asset: AssetMap[string]): Texture | AudioStream {
  if (asset instanceof SpriteSheet || asset instanceof Atlas) return asset.texture
  if (asset instanceof Texture) return asset._base ?? asset
  return asset
}

const pending = new Map<Texture, Promise<void>>()

/** 加载一组资源；已加载的跳过，同一资源并发请求只加载一次。音乐是流式的，不预加载。 */
export async function loadAssets(assets: AssetMap | undefined, platform: Platform, audio: AudioServer): Promise<void> {
  if (!assets) return
  await Promise.all(
    [...new Set(Object.values(assets).map(assetRoot))].map((asset) => {
      if (asset.isLoaded) return undefined
      if (asset instanceof AudioStream) {
        return audio._load(asset).catch((err: unknown) => {
          throw new Error(`Failed to load sound "${asset.path}": ${err instanceof Error ? err.message : String(err)}`)
        })
      }
      let p = pending.get(asset)
      if (!p) {
        p = platform.loadImage(asset.path).then(
          (img) => {
            asset._setLoaded(img.resource, img.width, img.height)
            pending.delete(asset)
          },
          (err: unknown) => {
            pending.delete(asset)
            throw new Error(`Failed to load texture "${asset.path}": ${err instanceof Error ? err.message : String(err)}`)
          },
        )
        pending.set(asset, p)
      }
      return p
    }),
  )
}
