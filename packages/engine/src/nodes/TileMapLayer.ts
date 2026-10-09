import { Node2D, type Node2DOptions } from '../core/Node2D'
import { TILE_EMPTY, type TileData, type TileSet } from '../core/tileset'
import { Rect2 } from '../math/Rect2'
import { Vector2 } from '../math/Vector2'

/** 区块边长（格）：渲染时每个区块一个 Mesh（ADR 0008）。 */
export const TILE_CHUNK = 16

export interface TileMapLayerOptions extends Node2DOptions {
  tileSet: TileSet
  /** 地图宽度（格），创建后不能改。 */
  width: number
  /** 地图高度（格），创建后不能改。 */
  height: number
  /** 初始格子：按行排列的图块编号（0 为空），长度必须是 `width × height`。 */
  cells?: ArrayLike<number>
  /** 碰撞层（位掩码），默认 1。`CharacterBody2D` 的 `collisionMask` 和它有交集时才会被这一层挡住。 */
  collisionLayer?: number
}

/**
 * 一层图块地图：`width × height` 个格子，每格是 `tileSet` 里的一个图块编号（0 为空），格子左上角在节点原点。
 * 多层地图就是多个 TileMapLayer 节点，叠放顺序由场景树决定。设计见 ADR 0008。
 *
 * - 地图外的格子算空：`getCell` 返回 0，碰撞查询返回“没有碰撞”。
 * - 渲染：16 × 16 格一个区块，只画屏幕内的区块；改一格只更新它所在的区块。
 * - 碰撞：不生成物理刚体。`CharacterBody2D` 直接查这一层的格子（ADR 0009），图层可以平移，不能旋转、缩放。
 */
export class TileMapLayer extends Node2D {
  readonly tileSet: TileSet
  readonly width: number
  readonly height: number
  /** 碰撞层（位掩码）。 */
  collisionLayer: number
  /** @internal 按行排列的图块编号。 */
  readonly _cells: Uint16Array
  /** @internal 区块的列数、行数。 */
  readonly _chunksX: number
  readonly _chunksY: number
  /** @internal 每个区块的版本号，区块里有格子改动时递增；渲染层据此只重建改过的区块。 */
  readonly _chunkVersions: Uint32Array
  private _usedCount = 0

  constructor(options: TileMapLayerOptions) {
    super(options)
    const { tileSet, width, height, cells } = options
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new Error(`TileMapLayer: width and height must be positive integers (got ${width}×${height}).`)
    }
    this.tileSet = tileSet
    this.width = width
    this.height = height
    this.collisionLayer = options.collisionLayer ?? 1
    this._cells = new Uint16Array(width * height)
    this._chunksX = Math.ceil(width / TILE_CHUNK)
    this._chunksY = Math.ceil(height / TILE_CHUNK)
    this._chunkVersions = new Uint32Array(this._chunksX * this._chunksY)
    if (cells) {
      if (cells.length !== width * height) throw new Error(`TileMapLayer: cells has ${cells.length} entries, expected ${width}×${height} = ${width * height}.`)
      for (let i = 0; i < cells.length; i++) {
        const id = cells[i]!
        checkId(id)
        this._cells[i] = id
        if (id) this._usedCount++
      }
    }
  }

  /** 非空的格子数。 */
  get usedCellCount(): number {
    return this._usedCount
  }

  /** 格子 (cx, cy) 的图块编号；空格子和地图外为 0。 */
  getCell(cx: number, cy: number): number {
    if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height || !Number.isInteger(cx) || !Number.isInteger(cy)) return 0
    return this._cells[cy * this.width + cx]!
  }

  /** 把格子 (cx, cy) 设为第 `id` 个图块（0 表示清空）。坐标在地图外时报错。 */
  setCell(cx: number, cy: number, id: number): void {
    if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height || !Number.isInteger(cx) || !Number.isInteger(cy)) {
      throw new Error(`TileMapLayer "${this.name}": cell (${cx}, ${cy}) is outside the map (${this.width}×${this.height}).`)
    }
    checkId(id)
    const i = cy * this.width + cx
    const old = this._cells[i]!
    if (old === id) return
    this._cells[i] = id
    this._usedCount += (id ? 1 : 0) - (old ? 1 : 0)
    this._chunkVersions[Math.floor(cy / TILE_CHUNK) * this._chunksX + Math.floor(cx / TILE_CHUNK)]!++
  }

  /** 清空格子 (cx, cy)。 */
  eraseCell(cx: number, cy: number): void {
    this.setCell(cx, cy, 0)
  }

  /** 格子 (cx, cy) 的图块属性；空格子和地图外为 null。 */
  getCellTileData(cx: number, cy: number): TileData | null {
    const id = this.getCell(cx, cy)
    return id ? this.tileSet.tile(id) : null
  }

  /** 局部坐标（像素）→ 所在的格子坐标。地图外的点也会返回格子坐标（可能为负）。 */
  localToMap(local: Vector2): Vector2 {
    const s = this.tileSet.tileSize
    return new Vector2(Math.floor(local.x / s), Math.floor(local.y / s))
  }

  /** 格子坐标 → 格子中心的局部坐标（像素）。 */
  mapToLocal(cell: Vector2): Vector2 {
    const s = this.tileSet.tileSize
    return new Vector2((cell.x + 0.5) * s, (cell.y + 0.5) * s)
  }

  /** 包含所有非空格子的最小矩形（单位是格）；地图为空时是 (0, 0, 0, 0)。 */
  getUsedRect(): Rect2 {
    let x0 = this.width
    let y0 = this.height
    let x1 = -1
    let y1 = -1
    const w = this.width
    for (let i = 0; i < this._cells.length; i++) {
      if (!this._cells[i]) continue
      const x = i % w
      const y = (i - x) / w
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
    return x1 < 0 ? new Rect2(0, 0, 0, 0) : new Rect2(x0, y0, x1 - x0 + 1, y1 - y0 + 1)
  }

  /**
   * @internal 格子 (cx, cy) 的碰撞类型（TILE_EMPTY / TILE_SOLID / TILE_ONE_WAY），地图外没有碰撞。给 CharacterBody2D 用，不分配内存。
   * 热路径，不检查参数：`cx`、`cy` 必须是整数（调用方先 `Math.floor`），否则读到 undefined、当成没有碰撞。
   */
  _cellCollision(cx: number, cy: number): number {
    if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height) return TILE_EMPTY
    return this.tileSet._collision[this._cells[cy * this.width + cx]!] ?? TILE_EMPTY
  }

  override _onEnterTree(): void {
    this.tree._tileLayers.push(this)
  }

  override _onExitTree(): void {
    const layers = this.tree._tileLayers
    const i = layers.indexOf(this)
    if (i >= 0) layers.splice(i, 1)
  }

  protected override dumpProps(): Record<string, unknown> {
    return {
      ...super.dumpProps(),
      tileSet: this.tileSet.texture.path,
      size: `${this.width}x${this.height}`,
      cells: this._usedCount,
      collisionLayer: this.collisionLayer !== 1 ? this.collisionLayer : undefined,
    }
  }
}

function checkId(id: number): void {
  if (!Number.isInteger(id) || id < 0 || id > 0xffff) throw new Error(`TileMapLayer: tile id must be an integer from 0 (empty) to 65535 (got ${id}).`)
}
