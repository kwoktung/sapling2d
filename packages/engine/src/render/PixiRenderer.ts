import {
  compileHighShaderGlProgram,
  Container,
  Graphics,
  ImageSource,
  localUniformBitGl,
  Matrix,
  Mesh,
  MeshGeometry,
  Rectangle,
  roundPixelsBitGl,
  Shader,
  Sprite,
  Text,
  Texture as PixiTexture,
  textureBitGl,
  WebGLRenderer,
  type GlProgram,
  type TextStyleOptions,
} from 'pixi.js'
import type { Texture } from '../core/assets'
import type { Node } from '../core/Node'
import { Node2D } from '../core/Node2D'
import type { SceneTree } from '../core/SceneTree'
import type { Viewport } from '../core/Viewport'
import { Rect2 } from '../math/Rect2'
import { Label } from '../nodes/Label'
import { Sprite2D } from '../nodes/Sprite2D'
import { TILE_CHUNK, TileMapLayer } from '../nodes/TileMapLayer'
import type { Renderer } from '../runtime/Game'

export interface PixiRendererOptions {
  /** 平台提供的画布（浏览器是 HTMLCanvasElement，小游戏是 wx 的上屏 canvas）。尺寸由视口决定。 */
  canvas: unknown
  background?: number
  /** 小游戏只能用 WebGL1（见 spikes/wechat/REPORT.md）。 */
  webglVersion?: 1 | 2
  /** 初始化期间这些 Pixi 警告降级为 console.debug（平台已知、无害的警告）。 */
  quietWarnings?: RegExp[]
  /** 像素风：贴图用最近邻采样，精灵的顶点对齐到物理像素。见 `GameOptions` 里的同名选项。 */
  pixelArt?: boolean
}

/** 每个 Node2D 对应的显示对象。 */
interface View {
  /** 承载节点变换的容器；子节点的显示对象都挂在它下面。 */
  container: Container
  /** 上次同步时节点的 `_transformVersion`，变了只更新容器的变换。 */
  transformVersion: number
  /** 上次同步时节点的 `_version`（变换以外的显示状态），变了才更新可见性、颜色、贴图、文字。 */
  version: number
  /** 最近一次同步到它的帧号；同步结束时帧号不是本帧的显示对象属于已离开树的节点。 */
  frame: number
  /** Sprite2D 的贴图层：放在容器内，offset、centered、flip 作用在它上面，不影响子节点。 */
  sprite?: Sprite
  /** 上次同步时贴图句柄背后的资源，用来发现“贴图后来才加载完成”。 */
  textureResource?: unknown
  /** Label 的文字层。 */
  text?: Text
  /** 上次应用的文字样式；Pixi 每次设置样式都会重绘文字贴图，所以只在真正变化时才设置。 */
  styleKey?: string
  /** 上次应用的文字分辨率。 */
  textResolution?: number
  /** TileMapLayer 的区块层。 */
  tiles?: TileView
}

/** TileMapLayer 的显示对象：内容层里每个区块一个 Mesh（ADR 0008），区块进入屏幕时才创建。 */
interface TileView {
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

/**
 * 把场景树同步到 Pixi（见 ADR 0002）：
 * - 节点首次被渲染时才创建显示对象
 * - 只有 `_transformVersion` / `_version` 变化的节点才分别更新变换 / 外观
 * - 每帧都要遍历整棵树，所以遍历本身不分配对象（iOS 小游戏上分配很贵，见 spikes/bullets/REPORT.md）
 * - 显示对象的层级和顺序与场景树一致；不是 Node2D 的节点不产生显示对象，其子节点挂到最近的 Node2D 祖先下
 * - 离开树的节点，显示对象在下一次同步时销毁
 * - 画布尺寸跟随屏幕；场景整体按视口缩放、平移到设计坐标；`keep` 模式裁剪到设计区域
 */
export class PixiRenderer implements Renderer {
  private readonly _renderer: WebGLRenderer
  /** 渲染根：包含场景容器和（keep 模式的）裁剪遮罩。 */
  private readonly _root = new Container()
  /** 场景容器：施加视口变换，Autoload 和当前场景的显示对象挂在这里。 */
  private readonly _sceneContainer = new Container()
  private readonly _mask = new Graphics()
  private _viewportVersion = -1
  /** 文字的栅格化分辨率：渲染分辨率 × 视口缩放，保证文字在任何屏幕上都按实际像素清晰绘制。 */
  private _textResolution = 1
  private readonly _views = new Map<Node2D, View>()
  /** 同步的帧号，和本帧同步到的显示对象数量（与 `_views.size` 相同说明没有节点离开树）。 */
  private _frame = 0
  private _seen = 0
  /** `_syncChildren` 每层递归复用的数组。 */
  private readonly _orderedByDepth: Container[][] = []
  /** 整张图 → GPU 上的图片源，记下创建时用的资源：资源被卸载或替换后释放。图集的各帧共用整张图的源。 */
  private readonly _sources = new Map<Texture, { resource: unknown; source: ImageSource }>()
  /** 贴图句柄（整张图或子区域）→ Pixi 贴图；与图片源同时失效。 */
  private readonly _textures = new Map<Texture, { resource: unknown; texture: PixiTexture }>()
  /**
   * 图块集的整张图 → 区块 Mesh 用的着色器。每张图一个，而不用 Pixi 共用的 Mesh 着色器：
   * 共用的着色器会一直绑着最后画过的图，释放那张图时 Pixi 会警告“贴图还绑在着色器上”。这里先销毁着色器，再释放图。
   */
  private readonly _tileShaders = new Map<Texture, { resource: unknown; shader: Shader }>()
  /** 本次同步时屏幕上可见的区域（设计坐标），用来裁剪 TileMapLayer 的区块。 */
  private _visibleRect: Rect2 = new Rect2(0, 0, 0, 0)
  /** `_chunkRange` 的结果：屏幕内的区块范围（含两端）。 */
  private _cx0 = 0
  private _cy0 = 0
  private _cx1 = -1
  private _cy1 = -1

  /**
   * @internal 测试用：不初始化 WebGL，只做场景树到显示对象的同步（`sync()`），不能调用 `render()`。
   */
  static _createForSyncTests(options: { pixelArt?: boolean } = {}): PixiRenderer {
    return new PixiRenderer(null as unknown as WebGLRenderer, options.pixelArt ?? false)
  }

  /** @internal 测试用：根容器。 */
  get _stage(): Container {
    return this._sceneContainer
  }

  /**
   * 像素风：图片源用最近邻采样；Sprite2D 的贴图层打开 Pixi 的 `roundPixels`（在顶点着色器里把顶点对齐到物理像素）。
   * 只对贴图层打开，不对整个渲染器：文字、Graphics 和视口遮罩不受影响。
   */
  private readonly _pixelArt: boolean

  private constructor(renderer: WebGLRenderer, pixelArt: boolean) {
    this._renderer = renderer
    this._pixelArt = pixelArt
    this._sceneContainer.sortableChildren = true
    this._root.addChild(this._sceneContainer)
  }

  static async create(options: PixiRendererOptions): Promise<PixiRenderer> {
    const renderer = new WebGLRenderer()
    const quiet = options.quietWarnings ?? []
    const warn = console.warn
    if (quiet.length) {
      console.warn = (...args: unknown[]) => (quiet.some((re) => args.some((a) => typeof a === 'string' && re.test(a))) ? console.debug(...args) : warn(...args))
    }
    try {
      await renderer.init({
      canvas: options.canvas as never,
      width: 1,
      height: 1,
      // 浏览器里同步设置画布的 CSS 尺寸；小游戏的 canvas 没有 style，Pixi 会跳过
      autoDensity: true,
      background: options.background ?? 0x000000,
      preferWebGLVersion: options.webglVersion ?? 2,
      // 不加载 Pixi 的事件系统等 DOM 相关扩展：输入由引擎自己处理（见 ADR 0001）
      skipExtensionImports: true,
      antialias: false,
      })
    } finally {
      console.warn = warn
    }
    return new PixiRenderer(renderer, options.pixelArt ?? false)
  }

  render(tree: SceneTree): void {
    this.sync(tree)
    this._renderer.render(this._root)
  }

  /** 只同步，不绘制。测试用。 */
  sync(tree: SceneTree): void {
    this._releaseUnloadedTextures()
    this._syncViewport(tree.viewport)
    this._visibleRect = tree.viewport.visibleRect
    const frame = ++this._frame
    this._seen = 0
    this._syncChildren(tree._topLevel(), this._sceneContainer, 0)
    if (this._seen === this._views.size) return
    // 有节点离开了树：销毁它们的显示对象（Map 的 forEach 里删除当前项是安全的）
    this._views.forEach((view, node) => {
      if (view.frame !== frame) this._destroyView(node, view)
    })
  }

  private _syncViewport(viewport: Viewport): void {
    if (viewport._version === this._viewportVersion) return
    this._viewportVersion = viewport._version
    const { width, height } = viewport.screen
    this._renderer?.resize(width, height, viewport.renderResolution)
    this._textResolution = viewport.renderResolution * viewport.scale
    this._sceneContainer.scale.set(viewport.scale)
    this._sceneContainer.position.set(viewport.offset.x, viewport.offset.y)
    if (viewport.aspect === 'keep') {
      const o = viewport.offset
      this._mask.clear().rect(o.x, o.y, viewport.designWidth * viewport.scale, viewport.designHeight * viewport.scale).fill(0xffffff)
      if (!this._mask.parent) this._root.addChild(this._mask)
      this._sceneContainer.mask = this._mask
    }
  }

  destroy(): void {
    for (const [node, view] of this._views) this._destroyView(node, view)
    for (const cached of this._tileShaders.values()) cached.shader.destroy()
    this._tileShaders.clear()
    for (const cached of this._textures.values()) cached.texture.destroy(false)
    for (const cached of this._sources.values()) cached.source.destroy()
    this._textures.clear()
    this._sources.clear()
    this._renderer?.destroy()
  }

  /**
   * 同步一组兄弟节点，并让 `parent` 的子显示对象与它们的顺序一致。
   * `depth` 选用哪个复用数组：每层递归一个，同一层的兄弟调用依次复用（上一个用完才轮到下一个）。
   */
  private _syncChildren(nodes: readonly Node[], parent: Container, depth: number): void {
    const ordered = (this._orderedByDepth[depth] ??= [])
    ordered.length = 0
    for (let i = 0; i < nodes.length; i++) this._visit(nodes[i]!, ordered, depth)

    // 保持顺序：Sprite2D / Label 的内容层永远在第 0 个（最底层），之后是子节点的容器
    const current = parent.children
    const offset = current.length > 0 && current[0]!.label === CONTENT_LABEL ? 1 : 0
    let inOrder = current.length === offset + ordered.length
    for (let i = 0; inOrder && i < ordered.length; i++) inOrder = current[offset + i] === ordered[i]
    if (inOrder) return
    const content = offset ? current[0]! : null
    parent.removeChildren()
    if (content) parent.addChild(content)
    for (let i = 0; i < ordered.length; i++) parent.addChild(ordered[i]!)
  }

  private _visit(node: Node, ordered: Container[], depth: number): void {
    const children = node.children
    if (!(node instanceof Node2D)) {
      // 非 Node2D：自己不显示，子节点按顺序挂到当前容器
      for (let i = 0; i < children.length; i++) this._visit(children[i]!, ordered, depth)
      return
    }
    const view = this._syncNode(node)
    ordered.push(view.container)
    // 叶子节点（大多数子弹、精灵）不用递归：除非它的容器里还留着已经移走的子节点
    const contentCount = view.sprite || view.text || view.tiles ? 1 : 0
    if (children.length > 0 || view.container.children.length > contentCount) this._syncChildren(children, view.container, depth + 1)
  }

  private _syncNode(node: Node2D): View {
    let view = this._views.get(node)
    if (!view) {
      view = { container: new Container({ label: node.name }), transformVersion: -1, version: -1, frame: 0 }
      view.container.sortableChildren = true
      if (node instanceof Sprite2D) {
        view.sprite = new Sprite({ label: CONTENT_LABEL, roundPixels: this._pixelArt })
        view.container.addChild(view.sprite)
      } else if (node instanceof Label) {
        view.text = new Text({ label: CONTENT_LABEL })
        view.container.addChild(view.text)
      } else if (node instanceof TileMapLayer) {
        view.tiles = { content: new Container({ label: CONTENT_LABEL }), chunks: new Array<TileChunk | null>(node._chunksX * node._chunksY).fill(null), resource: null, x0: 0, y0: 0, x1: -1, y1: -1 }
        view.container.addChild(view.tiles.content)
      }
      this._views.set(node, view)
      node._view = view.container
    }

    view.frame = this._frame
    this._seen++
    const c = view.container
    if (view.transformVersion !== node._transformVersion) {
      view.transformVersion = node._transformVersion
      c.position.set(node.x, node.y)
      c.rotation = node.rotation
      const scale = node.scale
      c.scale.set(scale.x, scale.y)
    }

    // 区块的显示和重建每帧都要检查：镜头或视口变化时不会改节点的版本号
    // 隐藏的图层不建区块；重新显示后再同步
    if (view.tiles && node.visible) this._syncTiles(node as TileMapLayer, view.tiles)

    const textureResource = node instanceof Sprite2D ? node.texture?._resource : undefined
    if (view.version === node._version && view.textureResource === textureResource && (!view.text || view.textResolution === this._textResolution)) {
      return view
    }
    view.version = node._version

    c.visible = node.visible
    c.zIndex = node.zIndex
    c.alpha = node.alpha
    c.tint = node.modulate // Pixi v8 的容器 tint 会乘到所有子对象上

    if (node instanceof Sprite2D && view.sprite) {
      view.textureResource = textureResource
      const s = view.sprite
      s.texture = node.texture ? this._pixiTexture(node.texture) : PixiTexture.EMPTY
      s.anchor.set(node.centered ? 0.5 : 0)
      s.position.set(node.offset.x, node.offset.y)
      s.scale.set(node.flipH ? -1 : 1, node.flipV ? -1 : 1)
      s.tint = node.selfModulate
    } else if (node instanceof Label && view.text) {
      this._syncText(node, view, view.text)
      view.text.tint = node.selfModulate
    }
    return view
  }

  private _syncText(node: Label, view: View, text: Text): void {
    const style: TextStyleOptions = {
      fontSize: node.fontSize,
      fill: node.color,
      fontFamily: node.fontFamily,
      fontWeight: node.fontWeight,
      align: node.align,
      ...(node.stroke ? { stroke: { color: node.stroke.color, width: node.stroke.width } } : {}),
      ...(node.wrapWidth !== null ? { wordWrap: true, wordWrapWidth: node.wrapWidth } : {}),
      ...(node.lineHeight !== null ? { lineHeight: node.lineHeight } : {}),
    }
    const styleKey = JSON.stringify(style)
    if (styleKey !== view.styleKey) {
      text.style = style
      view.styleKey = styleKey
    }
    text.text = node.text // 相同字符串时 Pixi 不会重绘
    if (view.textResolution !== this._textResolution) {
      text.resolution = this._textResolution
      view.textResolution = this._textResolution
    }
    text.anchor.set(ANCHOR[node.align], ANCHOR[node.verticalAlign])
  }

  /**
   * 同步 TileMapLayer 的区块：屏幕内的区块显示（第一次进入屏幕时创建），格子改过的区块重建顶点，刚离开屏幕的隐藏。
   * 每帧都会调用，只遍历屏幕内和上一帧屏幕内的区块，不分配内存。
   */
  private _syncTiles(node: TileMapLayer, tv: TileView): void {
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
    const inView = this._chunkRange(node)
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
   * 屏幕可见区域换算到图层的局部坐标，得到要显示的区块范围（写到 `_cx0` 等字段）。整个图层都不可见时返回 false。
   * 全局变换按祖先逐级用数字累乘（和 `Node2D.globalTransform` 相同，但不创建 Transform2D 对象）。
   */
  private _chunkRange(node: TileMapLayer): boolean {
    let a = 1
    let b = 0
    let c = 0
    let d = 1
    let tx = 0
    let ty = 0
    for (let n: Node | null = node; n; n = n.parent) {
      if (!(n instanceof Node2D)) continue
      // 局部变换 L = 平移 · 旋转 · 缩放；累乘 M = L · M
      const rotation = n.rotation
      const scale = n.scale
      const cos = rotation === 0 ? 1 : Math.cos(rotation)
      const sin = rotation === 0 ? 0 : Math.sin(rotation)
      const la = cos * scale.x
      const lb = sin * scale.x
      const lc = -sin * scale.y
      const ld = cos * scale.y
      const na = la * a + lc * b
      const nb = lb * a + ld * b
      const nc = la * c + lc * d
      const nd = lb * c + ld * d
      const ntx = la * tx + lc * ty + n.x
      const nty = lb * tx + ld * ty + n.y
      a = na
      b = nb
      c = nc
      d = nd
      tx = ntx
      ty = nty
    }
    const det = a * d - b * c
    if (det === 0) return false
    // 逆变换
    const ia = d / det
    const ib = -b / det
    const ic = -c / det
    const id = a / det
    const itx = (c * ty - d * tx) / det
    const ity = (b * tx - a * ty) / det
    const r = this._visibleRect
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let k = 0; k < 4; k++) {
      const gx = k & 1 ? r.right : r.left
      const gy = k & 2 ? r.bottom : r.top
      const lx = ia * gx + ic * gy + itx
      const ly = ib * gx + id * gy + ity
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
    const texture = this._pixiTexture(node.tileSet.texture)
    const quads = TILE_CHUNK * TILE_CHUNK
    const geometry = new MeshGeometry({
      positions: new Float32Array(quads * 8),
      uvs: new Float32Array(quads * 8),
      // iOS 小游戏的 WebGL1 没有 32 位索引：每个区块 1024 个顶点，16 位索引够用
      indices: TILE_INDICES as unknown as Uint32Array,
    })
    const mesh = new Mesh({ geometry, texture, shader: this._tileShader(node.tileSet.texture, texture), roundPixels: this._pixelArt })
    const size = TILE_CHUNK * node.tileSet.tileSize
    mesh.position.set(x * size, y * size)
    tv.content.addChild(mesh)
    return { mesh, geometry, version: -1, empty: true }
  }

  private _tileShader(texture: Texture, pixi: PixiTexture): Shader {
    const cached = this._tileShaders.get(texture)
    if (cached && cached.resource === texture._resource) return cached.shader
    cached?.shader.destroy()
    const shader = new Shader({
      // 编译程序要探测 WebGL 的精度，同步测试（没有 WebGL）里不编译
      glProgram: this._renderer ? tileProgram() : (undefined as unknown as GlProgram),
      resources: {
        uTexture: pixi.source,
        uSampler: pixi.source.style,
        textureUniforms: { uTextureMatrix: { type: 'mat3x3<f32>', value: new Matrix() } },
      },
    })
    this._tileShaders.set(texture, { resource: texture._resource, shader })
    return shader
  }

  /**
   * 资源被卸载（切换场景时）或替换后，立即销毁对应的 Pixi 贴图和图片源、释放显存——不等有精灵再次用到它。
   * 先于节点同步执行：此时引用它的精灵都已随旧场景销毁。
   */
  private _releaseUnloadedTextures(): void {
    // 先销毁绑着这张图的区块着色器，再销毁图片源（否则 Pixi 会警告）
    for (const [texture, cached] of this._tileShaders) {
      if (cached.resource !== texture._resource) {
        cached.shader.destroy()
        this._tileShaders.delete(texture)
      }
    }
    for (const [texture, cached] of this._textures) {
      if (cached.resource !== texture._resource) {
        cached.texture.destroy(false)
        this._textures.delete(texture)
      }
    }
    for (const [texture, cached] of this._sources) {
      if (cached.resource !== texture._resource) {
        cached.source.destroy()
        this._sources.delete(texture)
      }
    }
  }

  /** @internal 测试用：当前缓存的 Pixi 贴图数量（整张图和子区域各算一个）。 */
  get _textureCount(): number {
    return this._textures.size
  }

  /** @internal 测试用：区块着色器的数量（每张图块集图片一个）。 */
  get _tileShaderCount(): number {
    return this._tileShaders.size
  }

  /** @internal 测试用：当前 GPU 上的图片源数量（每张图一个，图集的帧共用）。 */
  get _sourceCount(): number {
    return this._sources.size
  }

  private _pixiTexture(texture: Texture): PixiTexture {
    const resource = texture._resource
    const cached = this._textures.get(texture)
    if (cached && cached.resource === resource) return cached.texture
    if (cached) {
      cached.texture.destroy(false) // 资源已卸载或换了
      this._textures.delete(texture)
    }
    if (!resource) return PixiTexture.EMPTY
    const source = this._imageSource(texture._base ?? texture, resource)
    const f = texture._frame
    const created = f
      ? new PixiTexture({
          source,
          frame: new Rectangle(f.region.x, f.region.y, f.region.width, f.region.height),
          orig: new Rectangle(0, 0, f.width, f.height),
          ...(f.trim ? { trim: new Rectangle(f.trim.x, f.trim.y, f.region.width, f.region.height) } : {}),
        })
      : new PixiTexture({ source })
    this._textures.set(texture, { resource, texture: created })
    return created
  }

  private _imageSource(base: Texture, resource: unknown): ImageSource {
    const cached = this._sources.get(base)
    if (cached && cached.resource === resource) return cached.source
    cached?.source.destroy()
    // 显式构造 ImageSource：小游戏的 Image 过不了 Pixi 的自动类型识别（见 spikes/wechat/REPORT.md）
    const source = new ImageSource({ resource: resource as never, ...(this._pixelArt ? { scaleMode: 'nearest' as const } : {}) })
    this._sources.set(base, { resource, source })
    return source
  }

  private _destroyView(node: Node2D, view: View): void {
    view.container.removeFromParent()
    view.sprite?.destroy()
    view.text?.destroy()
    if (view.tiles) {
      for (const chunk of view.tiles.chunks) if (chunk) destroyChunk(chunk)
      view.tiles.content.destroy()
    }
    view.container.destroy({ children: false })
    this._views.delete(node)
    if (node._view === view.container) node._view = null
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

/** Sprite2D 贴图层、Label 文字层的 label，用来和子节点的容器区分。 */
const CONTENT_LABEL = '__content'
const ANCHOR = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 } as const
