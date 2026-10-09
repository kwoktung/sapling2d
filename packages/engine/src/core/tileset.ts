import { tex, type Texture } from './assets'

/** 图块的碰撞类型：`solid` 整格实心；`oneWay` 单向平台（只从上方挡住）。不设置就是没有碰撞。 */
export type TileCollision = 'solid' | 'oneWay'

/** 定义一个图块的属性。 */
export interface TileOptions {
  collision?: TileCollision
  /** 游戏自己的字段，例如 `{ breakable: true }`。 */
  data?: Readonly<Record<string, unknown>>
}

export interface TileSetOptions {
  /** 格子边长（像素），图块是正方形。 */
  tileSize: number
  /** 图集的列数。不传时在图片加载后按宽度计算（无头模式下图片尺寸为 0，不影响碰撞和属性）。 */
  columns?: number
  /** 图集四周的留白（像素），默认 0。 */
  margin?: number
  /** 相邻图块之间的间距（像素），默认 0。 */
  spacing?: number
  /** 图块编号 → 属性。编号从 1 开始：第 1 个图块是图集左上角那格，从左到右、从上到下编号。 */
  tiles?: Readonly<Record<number, TileOptions>>
}

/** 一个图块的属性（`TileMapLayer.getCellTileData` 的返回值）。 */
export interface TileData {
  readonly id: number
  readonly collision: TileCollision | null
  readonly data: Readonly<Record<string, unknown>>
}

/** @internal 碰撞类型的数字编码，`TileMapLayer` 的格子查询用它，避免比较字符串。 */
export const TILE_EMPTY = 0
/** @internal */
export const TILE_SOLID = 1
/** @internal */
export const TILE_ONE_WAY = 2

const EMPTY_DATA: Readonly<Record<string, unknown>> = Object.freeze({})

/**
 * 图块集：一张图集贴图按 `tileSize` 切成格子，加上每个图块的属性（碰撞类型、自定义字段）。
 * 多个 `TileMapLayer` 可以共用一个图块集。用 `tileset(path, options)` 创建，放进场景的 `static assets` 预加载。
 *
 * 一个图块集只对应一张图（ADR 0008）。图块不能翻转、旋转，也没有动画。
 */
export class TileSet {
  readonly kind = 'tileset'
  readonly tileSize: number
  readonly margin: number
  readonly spacing: number
  private readonly _columns: number | null
  private readonly _tiles = new Map<number, TileData>()
  /** @internal 图块编号 → 碰撞类型（TILE_*）；超出长度的编号没有碰撞。 */
  readonly _collision: Uint8Array
  /** @internal 有没有任何图块带碰撞：没有的图块集（纯装饰的图层）CharacterBody2D 直接跳过。 */
  readonly _hasCollision: boolean

  /** @internal 请使用 tileset()。 */
  constructor(
    /** 图集贴图。 */
    readonly texture: Texture,
    options: TileSetOptions,
  ) {
    const { tileSize, columns, margin = 0, spacing = 0, tiles = {} } = options
    const where = `tileset('${texture.path}')`
    if (!(tileSize > 0)) throw new Error(`${where}: tileSize must be positive (got ${tileSize}).`)
    if (columns !== undefined && (!Number.isInteger(columns) || columns < 1)) throw new Error(`${where}: columns must be a positive integer (got ${columns}).`)
    this.tileSize = tileSize
    this.margin = margin
    this.spacing = spacing
    this._columns = columns ?? null
    let maxId = 0
    for (const key of Object.keys(tiles)) {
      const id = Number(key)
      if (!Number.isInteger(id) || id < 1 || id > 0xffff) throw new Error(`${where}: tile ids start at 1 and are at most 65535 (got ${key}).`)
      const t = tiles[id]!
      if (t.collision !== undefined && t.collision !== 'solid' && t.collision !== 'oneWay') {
        throw new Error(`${where}: tile ${id} has unknown collision '${String(t.collision)}' (use 'solid' or 'oneWay').`)
      }
      this._tiles.set(id, Object.freeze({ id, collision: t.collision ?? null, data: t.data ? Object.freeze({ ...t.data }) : EMPTY_DATA }))
      maxId = Math.max(maxId, id)
    }
    this._collision = new Uint8Array(maxId + 1)
    for (const [id, t] of this._tiles) this._collision[id] = t.collision === 'solid' ? TILE_SOLID : t.collision === 'oneWay' ? TILE_ONE_WAY : TILE_EMPTY
    this._hasCollision = this._collision.some((k) => k !== TILE_EMPTY)
  }

  get isLoaded(): boolean {
    return this.texture.isLoaded
  }

  /** 图集的列数：构造时给出的，或按图片宽度算出的（图片未加载时为 0）。 */
  get columns(): number {
    if (this._columns !== null) return this._columns
    const step = this.tileSize + this.spacing
    return Math.max(0, Math.floor((this.texture.width - 2 * this.margin + this.spacing) / step))
  }

  /** 第 `id` 个图块的属性（编号 1–65535）。没有定义过属性的图块返回 `collision: null`、空的 `data`。 */
  tile(id: number): TileData {
    if (!Number.isInteger(id) || id < 1 || id > 0xffff) throw new Error(`tileset('${this.texture.path}'): tile ids start at 1 and are at most 65535 (got ${id}).`)
    let t = this._tiles.get(id)
    if (!t) {
      t = Object.freeze({ id, collision: null, data: EMPTY_DATA })
      this._tiles.set(id, t)
    }
    return t
  }

  toString(): string {
    return `TileSet(${this.texture.path}, ${this.tileSize}px)`
  }
}

/**
 * 声明一个图块集：`path` 是图集图片（相对于资源目录）。
 *
 * ```ts
 * const TILES = tileset('tiles.png', {
 *   tileSize: 16,
 *   tiles: { 1: { collision: 'solid' }, 5: { collision: 'oneWay' }, 6: { collision: 'solid', data: { breakable: true } } },
 * })
 * class Level extends Scene {
 *   static assets = { tiles: TILES }
 * }
 * ```
 */
export function tileset(path: string, options: TileSetOptions): TileSet {
  return new TileSet(tex(path), options)
}
