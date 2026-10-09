import type { Platform } from '../platform/Platform'
import { TileMapLayer } from '../nodes/TileMapLayer'
import { Vector2 } from '../math/Vector2'
import { loadTexture, tex, type Texture } from './assets'
import { TileSet, type TileOptions } from './tileset'

/** Tiled 对象层里的一个对象（敌人、金币、出生点……）。坐标和 Tiled 里一样，单位是像素。 */
export interface TiledObject {
  readonly id: number
  readonly name: string
  /** Tiled 里的 Class（旧版本叫 Type）。 */
  readonly type: string
  /** 所在对象层的名字。 */
  readonly layer: string
  /** 矩形、椭圆、点、多边形：左上角（点就是点本身）；图块对象（`gid` 不为 0）：左下角（Tiled 的约定）。 */
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** 角度（度，顺时针）。 */
  readonly rotation: number
  readonly shape: 'rectangle' | 'ellipse' | 'point' | 'polygon' | 'polyline' | 'tile' | 'text'
  /** 多边形 / 折线的顶点（相对于 x, y）。 */
  readonly points: readonly Vector2[] | null
  /** 图块对象的图块编号（在 `tileSet` 里从 1 开始）；不是图块对象时为 0。 */
  readonly gid: number
  /** 图块对象所在的图块集；不是图块对象时为 null。 */
  readonly tileSet: TileSet | null
  /** 图块对象在 Tiled 里被水平 / 垂直翻转。 */
  readonly flipH: boolean
  readonly flipV: boolean
  readonly visible: boolean
  /** 自定义属性。 */
  readonly properties: Readonly<Record<string, unknown>>
}

export interface TiledObjectLayer {
  readonly name: string
  readonly objects: readonly TiledObject[]
  readonly properties: Readonly<Record<string, unknown>>
}

interface ParsedTileLayer {
  name: string
  width: number
  height: number
  tileSet: TileSet
  cells: Uint16Array
  visible: boolean
  opacity: number
  offsetX: number
  offsetY: number
  collisionLayer: number
  properties: Record<string, unknown>
}

interface ParsedMap {
  width: number
  height: number
  tileSize: number
  tileSets: TileSet[]
  tileLayers: ParsedTileLayer[]
  objectLayers: TiledObjectLayer[]
  properties: Record<string, unknown>
}

/**
 * Tiled 关卡（JSON 格式；扩展名建议用 `.json`：微信小游戏的代码包可能不收 `.tmj` / `.tsj`）。用 `tiledMap(path)` 声明，放进场景的 `static assets` 预加载：
 * 加载时读关卡文件和外部图块集（`.tsj`），再加载图块集的图片；切换场景时和贴图一样卸载。
 *
 * ```ts
 * const LEVEL = tiledMap('levels/1-1.json')
 * class Level extends Scene {
 *   static assets = { level: LEVEL }
 *   override ready() {
 *     for (const layer of LEVEL.createLayers()) this.add(layer)
 *     for (const o of LEVEL.objects('Entities')) if (o.type === 'Coin') this.add(new Coin({ position: v(o.x, o.y) }))
 *   }
 * }
 * ```
 *
 * 只支持正交（orthogonal）、有限大小的地图；图块是正方形、和地图的格子一样大；每个图块集一张图片；
 * 一个图块层只用一个图块集；图块不能翻转、旋转；图块层格式用 CSV（不能压缩）。遇到不支持的特性在加载时报错，指出是哪个图层或图块集。
 *
 * 图块的碰撞：在 Tiled 的图块集编辑器里给图块加字符串属性 `collision`，值是 `solid` 或 `oneWay`；其他自定义属性进 `TileData.data`。
 * 图块层的自定义整数属性 `collisionLayer` 设置图层的碰撞层（默认 1）。
 */
export class TiledMap {
  readonly kind = 'tiledmap'
  private _map: ParsedMap | null = null
  private _loading: Promise<void> | null = null

  /** @internal 请使用 tiledMap()。 */
  constructor(readonly path: string) {}

  /** 关卡文件和图块集的图片都加载完成。 */
  get isLoaded(): boolean {
    return this._map !== null && this._map.tileSets.every((t) => t.isLoaded)
  }

  /** 地图宽度（格）。 */
  get width(): number {
    return this._parsed().width
  }

  /** 地图高度（格）。 */
  get height(): number {
    return this._parsed().height
  }

  /** 格子边长（像素）。 */
  get tileSize(): number {
    return this._parsed().tileSize
  }

  /** 地图大小（像素），用来设置相机的 limit。 */
  get pixelWidth(): number {
    return this.width * this.tileSize
  }

  get pixelHeight(): number {
    return this.height * this.tileSize
  }

  /** 地图的自定义属性。 */
  get properties(): Readonly<Record<string, unknown>> {
    return this._parsed().properties
  }

  /** 关卡用到的图块集（按 Tiled 里的顺序）。 */
  get tileSets(): readonly TileSet[] {
    return this._parsed().tileSets
  }

  /** 图块层的名字（按 Tiled 里从下到上的顺序）。 */
  get layerNames(): readonly string[] {
    return this._parsed().tileLayers.map((l) => l.name)
  }

  /** 对象层（按 Tiled 里的顺序）。 */
  get objectLayers(): readonly TiledObjectLayer[] {
    return this._parsed().objectLayers
  }

  /**
   * 为每个图块层创建一个新的 TileMapLayer 节点，按 Tiled 里从下到上的顺序（依次 add 到场景里，叠放顺序就和 Tiled 一样）。
   * 节点名是图层名；Tiled 的偏移、可见性、不透明度对应 position、visible、alpha。每次调用都创建新节点（格子是拷贝）。
   */
  createLayers(): TileMapLayer[] {
    return this._parsed().tileLayers.map((l) => makeLayer(l))
  }

  /** 创建名为 `name` 的图块层节点。 */
  createLayer(name: string): TileMapLayer {
    const l = this._parsed().tileLayers.find((x) => x.name === name)
    if (!l) throw new Error(`tiledMap('${this.path}'): no tile layer named "${name}" (tile layers: ${this.layerNames.join(', ') || 'none'}).`)
    return makeLayer(l)
  }

  /** 对象：不传参数时是所有对象层的对象，传名字时是那一层的。 */
  objects(layer?: string): readonly TiledObject[] {
    const layers = this._parsed().objectLayers
    if (layer === undefined) return layers.flatMap((l) => l.objects)
    const l = layers.find((x) => x.name === layer)
    if (!l) throw new Error(`tiledMap('${this.path}'): no object layer named "${layer}" (object layers: ${layers.map((x) => x.name).join(', ') || 'none'}).`)
    return l.objects
  }

  /** @internal 由资源加载调用：读关卡和图块集文件（只读一次），再加载图块集的图片。 */
  _load(platform: Platform): Promise<void> {
    this._loading ??= (async () => {
      if (!this._map) this._map = await parseMap(this.path, platform)
    })().finally(() => (this._loading = null))
    return this._loading.then(() => Promise.all(this._map!.tileSets.map((t) => (t.isLoaded ? undefined : loadTexture(t.texture, platform))))).then(() => undefined)
  }

  /** 图块层的自定义属性。 */
  layerProperties(name: string): Readonly<Record<string, unknown>> {
    const l = this._parsed().tileLayers.find((x) => x.name === name)
    if (!l) throw new Error(`tiledMap('${this.path}'): no tile layer named "${name}" (tile layers: ${this.layerNames.join(', ') || 'none'}).`)
    return l.properties
  }

  /** @internal 图块集的图片（还没解析时为空）：切换场景时按图片判断要不要卸载（见 assetResources）。 */
  _textures(): Texture[] {
    return this._map?.tileSets.map((t) => t.texture) ?? []
  }

  /** @internal 关卡本身不占资源：图片作为单独的资源卸载，解析好的数据保留，再次加载时只加载图片。 */
  _unload(): void {}

  private _parsed(): ParsedMap {
    if (!this._map) throw new Error(`tiledMap('${this.path}') is not loaded yet; declare it in the scene's static assets.`)
    return this._map
  }
}

const mapCache = new Map<string, TiledMap>()

/** 声明一个 Tiled 关卡：`path` 是导出的 JSON 文件（相对于资源目录）。同一路径返回同一个句柄。 */
export function tiledMap(path: string): TiledMap {
  let m = mapCache.get(path)
  if (!m) {
    m = new TiledMap(path)
    mapCache.set(path, m)
  }
  return m
}

function makeLayer(l: ParsedTileLayer): TileMapLayer {
  return new TileMapLayer({
    name: l.name,
    tileSet: l.tileSet,
    width: l.width,
    height: l.height,
    cells: l.cells,
    position: new Vector2(l.offsetX, l.offsetY),
    visible: l.visible,
    alpha: l.opacity,
    collisionLayer: l.collisionLayer,
  })
}

// ---------------------------------------------------------------- 解析

/** Tiled JSON 里会用到的字段（其余忽略）。 */
interface RawProperty {
  name: string
  type?: string
  value: unknown
}
interface RawTile {
  id: number
  properties?: RawProperty[]
  animation?: unknown[]
  image?: string
  /** Tiled 碰撞编辑器里画的形状。 */
  objectgroup?: unknown
}
interface RawTileset {
  firstgid?: number
  source?: string
  name?: string
  image?: string
  imagewidth?: number
  tilewidth?: number
  tileheight?: number
  columns?: number
  margin?: number
  spacing?: number
  tiles?: RawTile[]
}
interface RawObject {
  id: number
  name?: string
  type?: string
  class?: string
  x: number
  y: number
  width?: number
  height?: number
  rotation?: number
  gid?: number
  point?: boolean
  ellipse?: boolean
  polygon?: { x: number; y: number }[]
  polyline?: { x: number; y: number }[]
  text?: unknown
  visible?: boolean
  properties?: RawProperty[]
}
interface RawLayer {
  type: string
  name: string
  width?: number
  height?: number
  data?: number[] | string
  encoding?: string
  compression?: string
  chunks?: unknown
  visible?: boolean
  opacity?: number
  offsetx?: number
  offsety?: number
  objects?: RawObject[]
  properties?: RawProperty[]
}
interface RawMap {
  orientation?: string
  infinite?: boolean
  width: number
  height: number
  tilewidth: number
  tileheight: number
  tilesets?: RawTileset[]
  layers?: RawLayer[]
  properties?: RawProperty[]
}

/** gid 的高 4 位是翻转 / 旋转标记（水平、垂直、对角、六边形 120°）。 */
const FLIP_MASK = 0xf0000000

async function parseMap(path: string, platform: Platform): Promise<ParsedMap> {
  const where = `tiledMap('${path}')`
  const map = await readJson<RawMap>(path, platform, where)
  if ((map.orientation ?? 'orthogonal') !== 'orthogonal') throw new Error(`${where}: only orthogonal maps are supported (got "${map.orientation}").`)
  if (map.infinite) throw new Error(`${where}: infinite maps are not supported; uncheck "Infinite" in Map Properties.`)
  if (map.tilewidth !== map.tileheight) throw new Error(`${where}: tiles must be square (got ${map.tilewidth}×${map.tileheight}).`)
  const tileSize = map.tilewidth

  // 图块集：外部的（source）先读进来
  const tileSets: { firstgid: number; set: TileSet }[] = []
  for (const ref of map.tilesets ?? []) {
    const firstgid = ref.firstgid ?? 1
    let raw = ref
    let file = path
    if (ref.source) {
      file = resolveAsset(dirOf(path), ref.source, `${where}: tileset "${ref.source}"`)
      raw = await readJson<RawTileset>(file, platform, `${where}: tileset "${ref.source}"`)
    }
    const tsWhere = `${where}: tileset "${raw.name ?? ref.source ?? firstgid}"`
    tileSets.push({ firstgid, set: makeTileSet(raw, file, tileSize, tsWhere) })
  }
  tileSets.sort((a, b) => a.firstgid - b.firstgid)

  const tileLayers: ParsedTileLayer[] = []
  const objectLayers: TiledObjectLayer[] = []
  for (const layer of map.layers ?? []) {
    const lWhere = `${where}: layer "${layer.name}"`
    if (layer.type === 'tilelayer') tileLayers.push(parseTileLayer(layer, map, tileSets, lWhere))
    else if (layer.type === 'objectgroup') objectLayers.push(parseObjectLayer(layer, tileSets))
    else if (layer.type === 'group') throw new Error(`${lWhere}: group layers are not supported; move its layers out of the group.`)
    else throw new Error(`${lWhere}: ${layer.type} layers are not supported (only tile layers and object layers).`)
  }
  return { width: map.width, height: map.height, tileSize, tileSets: tileSets.map((t) => t.set), tileLayers, objectLayers, properties: readProperties(map.properties) }
}

function makeTileSet(raw: RawTileset, file: string, tileSize: number, where: string): TileSet {
  if (!raw.image) throw new Error(`${where}: "collection of images" tilesets are not supported; use a tileset based on a single image.`)
  if (raw.tilewidth !== tileSize || raw.tileheight !== tileSize) {
    throw new Error(`${where}: tiles must be ${tileSize}×${tileSize} like the map (got ${raw.tilewidth}×${raw.tileheight}).`)
  }
  const tiles: Record<number, TileOptions> = {}
  let animated = false
  const shapesOnly: number[] = []
  for (const t of raw.tiles ?? []) {
    if (t.animation?.length) animated = true
    const props = readProperties(t.properties)
    const { collision, ...data } = props
    if (t.objectgroup && collision === undefined) shapesOnly.push(t.id)
    if (collision !== undefined && collision !== 'solid' && collision !== 'oneWay') {
      throw new Error(`${where}: tile ${t.id} has collision "${String(collision)}"; use "solid" or "oneWay".`)
    }
    if (collision === undefined && Object.keys(data).length === 0) continue
    tiles[t.id + 1] = { ...(collision ? { collision } : {}), ...(Object.keys(data).length ? { data } : {}) }
  }
  if (animated) console.warn(`${where}: animated tiles are not supported yet; the first frame is drawn.`)
  if (shapesOnly.length) {
    console.warn(`${where}: tiles ${shapesOnly.join(', ')} have collision shapes drawn in the collision editor, which are ignored; add a string property "collision" ("solid" or "oneWay") instead.`)
  }
  return new TileSet(tex(resolveAsset(dirOf(file), raw.image, `${where}: image "${raw.image}"`)), {
    tileSize,
    ...(raw.columns ? { columns: raw.columns } : {}),
    margin: raw.margin ?? 0,
    spacing: raw.spacing ?? 0,
    tiles,
  })
}

function parseTileLayer(layer: RawLayer, map: RawMap, tileSets: { firstgid: number; set: TileSet }[], where: string): ParsedTileLayer {
  if (layer.chunks) throw new Error(`${where}: infinite maps are not supported.`)
  if (!Array.isArray(layer.data) || layer.encoding === 'base64' || layer.compression) {
    throw new Error(`${where}: tile layer data must be CSV; set "Tile Layer Format" to CSV in Map Properties.`)
  }
  const w = layer.width ?? map.width
  const h = layer.height ?? map.height
  if (layer.data.length !== w * h) throw new Error(`${where}: has ${layer.data.length} cells, expected ${w}×${h} = ${w * h}.`)
  const cells = new Uint16Array(w * h)
  let used: { firstgid: number; set: TileSet } | null = null
  for (let i = 0; i < layer.data.length; i++) {
    const gid = layer.data[i]!
    if (gid === 0) continue
    if ((gid & FLIP_MASK) !== 0) throw new Error(`${where}: flipped or rotated tiles are not supported (cell ${i % w}, ${Math.floor(i / w)}).`)
    const ts = tileSetFor(gid, tileSets)
    if (!ts) throw new Error(`${where}: tile ${gid} at cell ${i % w}, ${Math.floor(i / w)} is not in any tileset.`)
    if (used && used !== ts) throw new Error(`${where}: uses more than one tileset; a TileMapLayer has a single tileset (split the layer).`)
    used = ts
    const id = gid - ts.firstgid + 1
    if (id > 0xffff) throw new Error(`${where}: tile id ${id} is too large (at most 65535).`)
    cells[i] = id
  }
  const props = readProperties(layer.properties)
  const collisionLayer = props.collisionLayer ?? 1
  if (typeof collisionLayer !== 'number') throw new Error(`${where}: property "collisionLayer" must be an int.`)
  // 空图层也要一个图块集：用第一个
  const tileSet = used?.set ?? tileSets[0]?.set
  if (!tileSet) throw new Error(`${where}: the map has no tileset.`)
  return {
    name: layer.name,
    width: w,
    height: h,
    tileSet,
    cells,
    visible: layer.visible ?? true,
    opacity: layer.opacity ?? 1,
    offsetX: layer.offsetx ?? 0,
    offsetY: layer.offsety ?? 0,
    collisionLayer,
    properties: props,
  }
}

function parseObjectLayer(layer: RawLayer, tileSets: { firstgid: number; set: TileSet }[]): TiledObjectLayer {
  const objects: TiledObject[] = (layer.objects ?? []).map((o) => {
    let gid = 0
    let tileSet: TileSet | null = null
    if (o.gid) {
      const raw = (o.gid & ~FLIP_MASK) >>> 0
      const ts = tileSetFor(raw, tileSets)
      gid = ts ? raw - ts.firstgid + 1 : raw
      tileSet = ts?.set ?? null
    }
    const pts = o.polygon ?? o.polyline
    return Object.freeze({
      id: o.id,
      name: o.name ?? '',
      type: o.class ?? o.type ?? '',
      layer: layer.name,
      x: o.x,
      y: o.y,
      width: o.width ?? 0,
      height: o.height ?? 0,
      rotation: o.rotation ?? 0,
      shape: o.gid ? 'tile' : o.point ? 'point' : o.ellipse ? 'ellipse' : o.polygon ? 'polygon' : o.polyline ? 'polyline' : o.text ? 'text' : 'rectangle',
      points: pts ? Object.freeze(pts.map((p) => new Vector2(p.x, p.y))) : null,
      gid,
      tileSet,
      flipH: o.gid !== undefined && (o.gid & 0x80000000) !== 0,
      flipV: o.gid !== undefined && (o.gid & 0x40000000) !== 0,
      visible: o.visible ?? true,
      properties: readProperties(o.properties),
    } satisfies TiledObject)
  })
  return Object.freeze({ name: layer.name, objects: Object.freeze(objects), properties: readProperties(layer.properties) })
}

function tileSetFor<T extends { firstgid: number }>(gid: number, tileSets: T[]): T | null {
  let found: T | null = null
  for (const t of tileSets) if (t.firstgid <= gid) found = t
  return found
}

function readProperties(props: RawProperty[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const p of props ?? []) out[p.name] = p.value
  return Object.freeze(out)
}

async function readJson<T>(path: string, platform: Platform, where: string): Promise<T> {
  let text: string
  try {
    text = await platform.loadText(path)
  } catch (err) {
    throw new Error(`${where}: cannot read "${path}": ${err instanceof Error ? err.message : String(err)}`)
  }
  try {
    return JSON.parse(text) as T
  } catch {
    const xml = /\.(tmx|tsx)$/i.test(path) || text.trimStart().startsWith('<')
    throw new Error(
      `${where}: "${path}" is not valid JSON` +
        (xml ? '; it is a Tiled XML file. Save maps and tilesets in JSON format (recommended extension .json).' : '; save it from Tiled in JSON format (recommended extension .json).'),
    )
  }
}

/** `a/b/c.tmj` → `a/b`；没有目录时是空串。 */
function dirOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

/** 拼接并规范化路径（处理 `.` 和 `..`），结果相对于资源目录。跳出资源目录时返回 null。 */
export function joinPath(dir: string, rel: string): string | null {
  const parts = (dir ? `${dir}/${rel}` : rel).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') {
      if (out.length === 0) return null
      out.pop()
    } else out.push(p)
  }
  return out.join('/')
}

/** joinPath，跳出资源目录时报错（文件必须都在资源目录里）。 */
function resolveAsset(dir: string, rel: string, where: string): string {
  const p = joinPath(dir, rel)
  if (p === null) throw new Error(`${where} points outside the assets directory; keep the map, tilesets and images inside it.`)
  return p
}
