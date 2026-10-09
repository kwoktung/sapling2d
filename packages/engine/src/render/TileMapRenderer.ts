import {
  compileHighShaderGlProgram,
  Container,
  localUniformBitGl,
  Matrix,
  Mesh,
  MeshGeometry,
  roundPixelsBitGl,
  Shader,
  textureBitGl,
  type GlProgram,
  type Texture as PixiTexture,
} from 'pixi.js'
import type { Texture } from '../core/assets'
import { identityAffine, invertAffine } from '../math/Affine'
import type { Rect2 } from '../math/Rect2'
import { TILE_CHUNK, type TileMapLayer } from '../nodes/TileMapLayer'
import type { TextureCache } from './TextureCache'

/** TileMapLayer 的显示对象：内容层里每个区块一个 Mesh（ADR 0008），区块进入屏幕时才创建。 */
export interface TileView {
  content: Container
  /** 按区块编号；还没进入过屏幕的区块为 null。 */
  chunks: (TileChunk | null)[]
  /** 区块顶点所基于的图片资源；图片重新加载后要重建全部区块。 */
  resource: unknown
  /** 上一帧显示的区块范围（含两端；x1 < x0 表示没有）。 */
  x0: number
  y0: number
  x1: number
  y1: number
}

interface TileChunk {
  mesh: Mesh<MeshGeometry, Shader>
  geometry: MeshGeometry
  /** 上次重建时节点的区块版本号（-1 表示还没建过）。 */
  version: number
  /** 区块里没有图块：不显示。 */
  empty: boolean
}

export interface TileMapRendererOptions {
  pixelArt: boolean
  /** 能否编译着色器程序：编译要探测 WebGL 的精度，同步测试（没有 WebGL）里不编译。 */
  compileShaders: boolean
  /** 渲染器的贴图缓存：图块集和精灵共用图片源。 */
  textures: TextureCache
}

/**
 * TileMapLayer 的区块渲染（ADR 0008）：按屏幕可见区域裁剪区块，格子改过的区块重建顶点。
 * 所有图层共用一个实例，它持有每张图块集图片的着色器；每个图层的状态在各自的 `TileView` 里。
 */
export class TileMapRenderer {
  private readonly _pixelArt: boolean
  private readonly _compileShaders: boolean
  private readonly _textures: TextureCache
  /**
   * 图块集的整张图 → 区块 Mesh 用的着色器。每张图一个，而不用 Pixi 共用的 Mesh 着色器：
   * 共用的着色器会一直绑着最后画过的图，释放那张图时 Pixi 会警告“贴图还绑在着色器上”。这里先销毁着色器，再释放图。
   */
  private readonly _shaders = new Map<Texture, { resource: unknown; shader: Shader }>()
  /** `_chunkRange` 用的图层全局变换（复用）。 */
  private readonly _global = identityAffine()
  /** `_chunkRange` 的结果：屏幕内的区块范围（含两端）。 */
  private _cx0 = 0
  private _cy0 = 0
  private _cx1 = -1
  private _cy1 = -1

  constructor(options: TileMapRendererOptions) {
    this._pixelArt = options.pixelArt
    this._compileShaders = options.compileShaders
    this._textures = options.textures
  }

  /** 当前的着色器数量（每张图块集图片一个）。 */
  get shaderCount(): number {
    return this._shaders.size
  }

  createView(node: TileMapLayer, label: string): TileView {
    return { content: new Container({ label }), chunks: new Array<TileChunk | null>(node._chunksX * node._chunksY).fill(null), resource: null, x0: 0, y0: 0, x1: -1, y1: -1 }
  }

  destroyView(tv: TileView): void {
    for (const chunk of tv.chunks) if (chunk) destroyChunk(chunk)
    tv.content.destroy()
  }

  /**
   * 同步区块：屏幕内的区块显示（第一次进入屏幕时创建），格子改过的区块重建顶点，刚离开屏幕的隐藏。
   * 每帧都会调用，只遍历屏幕内和上一帧屏幕内的区块，不分配内存。
   * `visibleRect` 是屏幕上可见的区域（设计坐标），`offsetX/Y` 是图层所在画布的相机偏移（世界坐标 + 偏移 = 设计坐标）。
   */
  sync(node: TileMapLayer, tv: TileView, visibleRect: Rect2, offsetX: number, offsetY: number): void {
    const texture = node.tileSet.texture
    const resource = texture._resource
    const columns = node.tileSet.columns
    if (!resource || columns === 0) {
      tv.content.visible = false
      return
    }
    tv.content.visible = true
    if (tv.resource !== resource) {
      // 图片重新加载过：旧区块用的是旧的图片源和着色器
      for (let i = 0; i < tv.chunks.length; i++) {
        const chunk = tv.chunks[i]
        if (chunk) destroyChunk(chunk)
        tv.chunks[i] = null
      }
      tv.resource = resource
      tv.x0 = 0
      tv.x1 = -1
    }
    const inView = this._chunkRange(node, visibleRect, offsetX, offsetY)
    const x0 = inView ? this._cx0 : 0
    const y0 = inView ? this._cy0 : 0
    const x1 = inView ? this._cx1 : -1
    const y1 = inView ? this._cy1 : -1
    const chunksX = node._chunksX
    // 上一帧可见、这一帧不可见的区块隐藏
    for (let y = tv.y0; y <= tv.y1; y++) {
      for (let x = tv.x0; x <= tv.x1; x++) {
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue
        const chunk = tv.chunks[y * chunksX + x]
        if (chunk) chunk.mesh.visible = false
      }
    }
    tv.x0 = x0
    tv.y0 = y0
    tv.x1 = x1
    tv.y1 = y1
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * chunksX + x
        let chunk = tv.chunks[i]
        if (!chunk) {
          chunk = this._createChunk(node, tv, x, y)
          tv.chunks[i] = chunk
        }
        const version = node._chunkVersions[i]!
        if (chunk.version !== version) {
          chunk.version = version
          chunk.empty = writeChunk(node, chunk.geometry, x, y, columns, this._pixelArt ? 0 : 0.5)
        }
        chunk.mesh.visible = !chunk.empty
      }
    }
  }

  /**
   * 资源被卸载或替换后销毁对应的着色器。要先于图片源的释放执行：着色器还绑着图时释放图，Pixi 会警告。
   */
  releaseUnloaded(): void {
    for (const [texture, cached] of this._shaders) {
      if (cached.resource !== texture._resource) {
        cached.shader.destroy()
        this._shaders.delete(texture)
      }
    }
  }

  destroy(): void {
    for (const cached of this._shaders.values()) cached.shader.destroy()
    this._shaders.clear()
  }

  /**
   * 屏幕可见区域换算到图层的局部坐标，得到要显示的区块范围（写到 `_cx0` 等字段）。整个图层都不可见时返回 false。
   */
  private _chunkRange(node: TileMapLayer, r: Rect2, offsetX: number, offsetY: number): boolean {
    const m = this._global
    node._computeGlobalInto(m)
    if (!invertAffine(m, m)) return false
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let k = 0; k < 4; k++) {
      // 可见区域换到世界坐标（减去相机偏移），再换到图层的局部坐标
      const gx = (k & 1 ? r.right : r.left) - offsetX
      const gy = (k & 2 ? r.bottom : r.top) - offsetY
      const lx = m.a * gx + m.c * gy + m.tx
      const ly = m.b * gx + m.d * gy + m.ty
      if (lx < minX) minX = lx
      if (lx > maxX) maxX = lx
      if (ly < minY) minY = ly
      if (ly > maxY) maxY = ly
    }
    const size = TILE_CHUNK * node.tileSet.tileSize
    this._cx0 = Math.max(0, Math.floor(minX / size))
    this._cy0 = Math.max(0, Math.floor(minY / size))
    this._cx1 = Math.min(node._chunksX - 1, Math.floor(maxX / size))
    this._cy1 = Math.min(node._chunksY - 1, Math.floor(maxY / size))
    return this._cx0 <= this._cx1 && this._cy0 <= this._cy1
  }

  private _createChunk(node: TileMapLayer, tv: TileView, x: number, y: number): TileChunk {
    const texture = this._textures.get(node.tileSet.texture)
    const quads = TILE_CHUNK * TILE_CHUNK
    const geometry = new MeshGeometry({
      positions: new Float32Array(quads * 8),
      uvs: new Float32Array(quads * 8),
      // iOS 小游戏的 WebGL1 没有 32 位索引：每个区块 1024 个顶点，16 位索引够用
      indices: TILE_INDICES as unknown as Uint32Array,
    })
    const mesh = new Mesh({ geometry, texture, shader: this._shader(node.tileSet.texture, texture), roundPixels: this._pixelArt })
    const size = TILE_CHUNK * node.tileSet.tileSize
    mesh.position.set(x * size, y * size)
    tv.content.addChild(mesh)
    return { mesh, geometry, version: -1, empty: true }
  }

  private _shader(texture: Texture, pixi: PixiTexture): Shader {
    const cached = this._shaders.get(texture)
    if (cached && cached.resource === texture._resource) return cached.shader
    cached?.shader.destroy()
    const shader = new Shader({
      glProgram: this._compileShaders ? tileProgram() : (undefined as unknown as GlProgram),
      resources: {
        uTexture: pixi.source,
        uSampler: pixi.source.style,
        textureUniforms: { uTextureMatrix: { type: 'mat3x3<f32>', value: new Matrix() } },
      },
    })
    this._shaders.set(texture, { resource: texture._resource, shader })
    return shader
  }
}

/** 所有区块共用的索引：每个四边形两个三角形。 */
const TILE_INDICES = (() => {
  const quads = TILE_CHUNK * TILE_CHUNK
  const out = new Uint16Array(quads * 6)
  for (let q = 0; q < quads; q++) out.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6)
  return out
})()

let _tileProgram: GlProgram | null = null
/** 区块 Mesh 的着色器程序：和 Pixi 默认的 Mesh 着色器相同（局部变换 + 贴图 + 顶点对齐）。 */
function tileProgram(): GlProgram {
  return (_tileProgram ??= compileHighShaderGlProgram({ name: 'tile-chunk', bits: [localUniformBitGl, textureBitGl, roundPixelsBitGl] }))
}

/**
 * 按格子重写一个区块的顶点和 uv（顶点在区块的局部坐标里），空格子和地图外写成面积为 0 的四边形。
 * `inset`：uv 向图块内缩的像素数。线性采样时缩半个像素，否则图块边缘会混进图集里相邻图块的颜色；
 * 最近邻采样（像素风）不缩，否则放大后边缘那一列像素会变窄。返回区块是否为空。
 */
function writeChunk(node: TileMapLayer, geometry: MeshGeometry, chunkX: number, chunkY: number, columns: number, inset: number): boolean {
  const set = node.tileSet
  const ts = set.tileSize
  const step = ts + set.spacing
  const texW = set.texture.width
  const texH = set.texture.height
  const pos = geometry.positions
  const uv = geometry.uvs
  const cells = node._cells
  const w = node.width
  let empty = true
  for (let ly = 0; ly < TILE_CHUNK; ly++) {
    const cy = chunkY * TILE_CHUNK + ly
    for (let lx = 0; lx < TILE_CHUNK; lx++) {
      const cx = chunkX * TILE_CHUNK + lx
      const o = (ly * TILE_CHUNK + lx) * 8
      const id = cx < w && cy < node.height ? cells[cy * w + cx]! : 0
      if (!id) {
        pos.fill(0, o, o + 8)
        continue
      }
      empty = false
      const x0 = lx * ts
      const y0 = ly * ts
      const x1 = x0 + ts
      const y1 = y0 + ts
      pos[o] = x0
      pos[o + 1] = y0
      pos[o + 2] = x1
      pos[o + 3] = y0
      pos[o + 4] = x1
      pos[o + 5] = y1
      pos[o + 6] = x0
      pos[o + 7] = y1
      const i = id - 1
      const tx = set.margin + (i % columns) * step
      const ty = set.margin + Math.floor(i / columns) * step
      const u0 = (tx + inset) / texW
      const v0 = (ty + inset) / texH
      const u1 = (tx + ts - inset) / texW
      const v1 = (ty + ts - inset) / texH
      uv[o] = u0
      uv[o + 1] = v0
      uv[o + 2] = u1
      uv[o + 3] = v0
      uv[o + 4] = u1
      uv[o + 5] = v1
      uv[o + 6] = u0
      uv[o + 7] = v1
    }
  }
  geometry.getBuffer('aPosition').update()
  geometry.getBuffer('aUV').update()
  return empty
}

/** 先销毁 Mesh 再销毁几何体（显存里的顶点缓冲区）。着色器和贴图是共用的，不在这里销毁。 */
function destroyChunk(chunk: TileChunk): void {
  chunk.mesh.destroy()
  chunk.geometry.destroy()
}
