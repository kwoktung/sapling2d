import {
  Container,
  Graphics,
  ImageSource,
  Matrix,
  Particle,
  ParticleContainer,
  Rectangle,
  Sprite,
  Text,
  Texture as PixiTexture,
  WebGLRenderer,
  type TextStyleOptions,
} from 'pixi.js'
// ParticleContainer 的渲染管线是可选扩展（skipExtensionImports 不会自动加载）
import 'pixi.js/particle-container'
import type { Texture } from '../core/assets'
import type { CanvasLayerLike, Node } from '../core/Node'
import { Node2D } from '../core/Node2D'
import type { SceneTree } from '../core/SceneTree'
import type { Viewport } from '../core/Viewport'
import { invertAffine } from '../math/Affine'
import { Rect2 } from '../math/Rect2'
import { Label } from '../nodes/Label'
import { Sprite2D } from '../nodes/Sprite2D'
import { ColorRect } from '../nodes/ColorRect'
import { Particles2D } from '../nodes/Particles2D'
import { TileMapLayer } from '../nodes/TileMapLayer'
import type { Renderer } from '../runtime/Game'
import { TileMapRenderer, type TileView } from './TileMapRenderer'

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
  /** Particles2D 的粒子层。 */
  particles?: ParticleView
}

/** Particles2D 的显示对象：一个 ParticleContainer（一次绘制调用），粒子对象按需创建、复用。 */
interface ParticleView {
  container: ParticleContainer
  pool: Particle[]
  /** 粒子当前用的贴图（节点的贴图句柄和背后的资源都要比较）。 */
  texture: Texture | null
  resource: unknown
  tint: number
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
  /** 场景容器：施加视口变换（设计坐标 → 屏幕）。 */
  private readonly _sceneContainer = new Container()
  /** 世界容器：在场景容器里，施加相机的平移（世界坐标 → 设计坐标）。Autoload 和当前场景的显示对象挂在这里。 */
  private readonly _worldContainer = new Container()
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
  /** 本次同步时屏幕上可见的区域（设计坐标），用来裁剪 TileMapLayer 的区块。 */
  private _visibleRect: Rect2 = new Rect2(0, 0, 0, 0)
  /** 本次同步时相机的画面偏移（世界坐标 + 偏移 = 设计坐标）。 */
  private _canvasX = 0
  private _canvasY = 0
  /** CanvasLayer → 它的容器（挂在场景容器上，和世界容器并列，不受相机影响）。 */
  private readonly _layers = new Map<Node, { container: Container; frame: number }>()
  /** 本次同步遇到的 CanvasLayer，按遍历顺序（复用）。 */
  private readonly _layerOrder: CanvasLayerLike[] = []
  /** 场景容器子对象的期望顺序（复用）。 */
  private readonly _sceneOrder: Container[] = []
  /** 正在同步的节点在几层 CanvasLayer 里面：大于 0 时没有相机偏移。 */
  private _inLayer = 0
  /** 外层有几个隐藏的 CanvasLayer：大于 0 时里面嵌套的层也隐藏。 */
  private _hiddenLayers = 0
  /** TileMapLayer 的区块渲染（共用一个，持有图块集的着色器）。 */
  private readonly _tileMaps: TileMapRenderer
  /**
   * 像素风：图片源用最近邻采样；Sprite2D 的贴图层打开 Pixi 的 `roundPixels`（在顶点着色器里把顶点对齐到物理像素）。
   * 只对贴图层打开，不对整个渲染器：文字、Graphics 和视口遮罩不受影响。
   */
  private readonly _pixelArt: boolean
  /** 粒子内容层的变换（复用）。 */
  private readonly _particleMatrix = new Matrix()

  /**
   * @internal 测试用：不初始化 WebGL，只做场景树到显示对象的同步（`sync()`），不能调用 `render()`。
   */
  static _createForSyncTests(options: { pixelArt?: boolean } = {}): PixiRenderer {
    return new PixiRenderer(null as unknown as WebGLRenderer, options.pixelArt ?? false)
  }

  /** @internal 测试用：节点显示对象的根容器（相机平移的世界容器；视口变换在它的父容器上）。 */
  get _stage(): Container {
    return this._worldContainer
  }

  private constructor(renderer: WebGLRenderer, pixelArt: boolean) {
    this._renderer = renderer
    this._pixelArt = pixelArt
    this._tileMaps = new TileMapRenderer({ pixelArt, compileShaders: !!renderer, pixiTexture: (texture) => this._pixiTexture(texture) })
    this._worldContainer.sortableChildren = true
    this._worldContainer.label = '__world'
    this._sceneContainer.addChild(this._worldContainer)
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
    this._syncCamera(tree.viewport)
    const frame = ++this._frame
    this._seen = 0
    this._layerOrder.length = 0
    this._syncChildren(tree._topLevel(), this._worldContainer, 0)
    this._syncLayers(frame)
    if (this._seen === this._views.size) return
    // 有节点离开了树：销毁它们的显示对象（Map 的 forEach 里删除当前项是安全的）
    this._views.forEach((view, node) => {
      if (view.frame !== frame) this._destroyView(node, view)
    })
  }

  /** 相机的平移写到世界容器上。像素风时对齐到物理像素：相机慢慢移动时，静止的东西不会在相邻两个像素之间跳。 */
  private _syncCamera(viewport: Viewport): void {
    this._visibleRect = viewport.visibleRect
    let x = viewport._canvasX
    let y = viewport._canvasY
    if (this._pixelArt) {
      const k = viewport.scale * viewport.renderResolution // 1 个设计像素 = k 个物理像素
      x = Math.round(x * k) / k
      y = Math.round(y * k) / k
    }
    this._canvasX = x
    this._canvasY = y
    this._worldContainer.position.set(x, y)
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
    for (const entry of this._layers.values()) entry.container.destroy({ children: false })
    this._layers.clear()
    this._tileMaps.destroy()
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
    if (node._isCanvasLayer) {
      // 自成一层：不挂到当前容器，挂到场景容器上（_syncLayers 排顺序）
      this._visitLayer(node as CanvasLayerLike, depth)
      return
    }
    if (!(node instanceof Node2D)) {
      // 非 Node2D：自己不显示，子节点按顺序挂到当前容器
      for (let i = 0; i < children.length; i++) this._visit(children[i]!, ordered, depth)
      return
    }
    const view = this._syncNode(node)
    ordered.push(view.container)
    // 叶子节点（大多数子弹、精灵）不用递归：除非它的容器里还留着已经移走的子节点
    const contentCount = view.sprite || view.text || view.tiles || view.particles ? 1 : 0
    if (children.length > 0 || view.container.children.length > contentCount) this._syncChildren(children, view.container, depth + 1)
  }

  private _visitLayer(node: CanvasLayerLike, depth: number): void {
    let entry = this._layers.get(node)
    if (!entry) {
      const container = new Container({ label: node.name })
      container.sortableChildren = true
      entry = { container, frame: 0 }
      this._layers.set(node, entry)
    }
    entry.frame = this._frame
    // 嵌套的层挂在场景容器上而不是外层下面，外层隐藏时要自己跟着隐藏
    entry.container.visible = node.visible && this._hiddenLayers === 0
    this._layerOrder.push(node)
    this._inLayer++
    if (!node.visible) this._hiddenLayers++
    this._syncChildren(node.children, entry.container, depth + 1)
    if (!node.visible) this._hiddenLayers--
    this._inLayer--
  }

  /**
   * 场景容器的子对象排成：layer < 0 的层、世界容器、layer >= 0 的层（同一 layer 按场景树里的顺序）。
   * 本次没遇到的层（节点离开了树）销毁容器；里面节点的显示对象由节点自己的清理销毁。
   */
  private _syncLayers(frame: number): void {
    const layers = this._layerOrder
    if (layers.length === 0 && this._layers.size === 0) return
    // 按 layer 稳定排序（插入排序：层通常只有几个）
    for (let i = 1; i < layers.length; i++) {
      const cur = layers[i]!
      let j = i - 1
      while (j >= 0 && layers[j]!.layer > cur.layer) {
        layers[j + 1] = layers[j]!
        j--
      }
      layers[j + 1] = cur
    }
    const order = this._sceneOrder
    order.length = 0
    let worldAdded = false
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i]!
      if (!worldAdded && layer.layer >= 0) {
        order.push(this._worldContainer)
        worldAdded = true
      }
      order.push(this._layers.get(layer)!.container)
    }
    if (!worldAdded) order.push(this._worldContainer)
    const scene = this._sceneContainer
    let inOrder = scene.children.length === order.length
    for (let i = 0; inOrder && i < order.length; i++) inOrder = scene.children[i] === order[i]
    if (!inOrder) {
      scene.removeChildren()
      for (let i = 0; i < order.length; i++) scene.addChild(order[i]!)
    }
    if (this._layers.size === layers.length) return
    this._layers.forEach((entry, node) => {
      if (entry.frame === frame) return
      entry.container.removeFromParent()
      entry.container.destroy({ children: false })
      this._layers.delete(node)
    })
  }

  private _syncNode(node: Node2D): View {
    let view = this._views.get(node)
    if (!view) {
      view = { container: new Container({ label: node.name }), transformVersion: -1, version: -1, frame: 0 }
      view.container.sortableChildren = true
      if (node instanceof Sprite2D) {
        view.sprite = new Sprite({ label: CONTENT_LABEL, roundPixels: this._pixelArt })
        view.container.addChild(view.sprite)
      } else if (node instanceof ColorRect) {
        // 白色贴图染色：和普通贴图一起合批，不用 Graphics
        view.sprite = new Sprite({ label: CONTENT_LABEL, texture: PixiTexture.WHITE, roundPixels: this._pixelArt })
        view.container.addChild(view.sprite)
      } else if (node instanceof Label) {
        view.text = new Text({ label: CONTENT_LABEL })
        view.container.addChild(view.text)
      } else if (node instanceof Particles2D) {
        const container = new ParticleContainer({
          label: CONTENT_LABEL,
          // 位置、缩放（在 vertex 里）、透明度每帧都变；贴图坐标不变，粒子不旋转
          dynamicProperties: { position: true, vertex: true, color: true, rotation: false, uvs: false },
          roundPixels: this._pixelArt,
        })
        view.particles = { container, pool: [], texture: null, resource: null, tint: -1 }
        view.container.addChild(container)
      } else if (node instanceof TileMapLayer) {
        view.tiles = this._tileMaps.createView(node, CONTENT_LABEL)
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
    if (view.tiles && node.visible) {
      // CanvasLayer 里没有相机偏移
      const inLayer = this._inLayer > 0
      this._tileMaps.sync(node as TileMapLayer, view.tiles, this._visibleRect, inLayer ? 0 : this._canvasX, inLayer ? 0 : this._canvasY)
    }
    // 粒子每帧都在动：每帧同步（隐藏时跳过）
    if (view.particles && node.visible) this._syncParticles(node as Particles2D, view.particles)

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
    } else if (node instanceof ColorRect && view.sprite) {
      const s = view.sprite
      const size = node.size
      s.width = size.x
      s.height = size.y
      s.tint = multiplyColor(node.color, node.selfModulate)
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
   * 同步粒子：把存活的粒子写进复用的 Particle 对象（每帧只写数字，不分配；粒子数第一次达到某个值时才创建对象）。
   * 全局坐标的粒子：内容层的变换设成节点全局变换的逆，抵消掉节点自己的移动，粒子画在全局坐标上。
   */
  private _syncParticles(node: Particles2D, pv: ParticleView): void {
    const pc = pv.container
    const texture = node.texture
    const resource = texture?._resource
    const n = texture ? node._count : 0
    const pool = pv.pool
    if (texture !== pv.texture || resource !== pv.resource) {
      pv.texture = texture
      pv.resource = resource
      const t = texture ? this._pixiTexture(texture) : PixiTexture.EMPTY
      pc.texture = t
      for (let i = 0; i < pool.length; i++) pool[i]!.texture = t
      pc.update()
    }
    const tint = node.selfModulate
    if (tint !== pv.tint) {
      pv.tint = tint
      for (let i = 0; i < pool.length; i++) pool[i]!.tint = tint
    }
    while (pool.length < n) pool.push(new Particle({ texture: pc.texture ?? PixiTexture.EMPTY, anchorX: 0.5, anchorY: 0.5, tint }))

    if (node.localCoords) {
      if (pc.x !== 0 || pc.y !== 0 || pc.rotation !== 0 || pc.scale.x !== 1 || pc.scale.y !== 1 || pc.skew.x !== 0 || pc.skew.y !== 0) {
        pc.setFromMatrix(this._particleMatrix.identity())
      }
    } else {
      node._computeGlobal()
      const m = this._particleMatrix
      if (!invertAffine(node._global, m)) {
        pc.visible = false
        return
      }
      pc.visible = true
      pc.setFromMatrix(m)
    }

    const children = pc.particleChildren
    if (children.length !== n) {
      for (let i = children.length; i < n; i++) children[i] = pool[i]!
      children.length = n
      pc.update()
    }
    const px = node._px
    const py = node._py
    const age = node._age
    const life = node._life
    const s0 = node.scaleStart
    const ds = node.scaleEnd - s0
    const a0 = node.alphaStart
    const da = node.alphaEnd - a0
    for (let i = 0; i < n; i++) {
      const p = pool[i]!
      const t = age[i]! / life[i]!
      const s = s0 + ds * t
      p.x = px[i]!
      p.y = py[i]!
      p.scaleX = s
      p.scaleY = s
      p.alpha = a0 + da * t
    }
  }

  /**
   * 资源被卸载（切换场景时）或替换后，立即销毁对应的 Pixi 贴图和图片源、释放显存——不等有精灵再次用到它。
   * 先于节点同步执行：此时引用它的精灵都已随旧场景销毁。
   */
  private _releaseUnloadedTextures(): void {
    // 先销毁绑着这张图的区块着色器，再销毁图片源（否则 Pixi 会警告）
    this._tileMaps.releaseUnloaded()
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
    return this._tileMaps.shaderCount
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
    if (view.tiles) this._tileMaps.destroyView(view.tiles)
    view.particles?.container.destroy()
    view.container.destroy({ children: false })
    this._views.delete(node)
    if (node._view === view.container) node._view = null
  }
}

/** 两个 0xRRGGBB 按通道相乘（和 GPU 里染色的效果一样）。 */
function multiplyColor(a: number, b: number): number {
  if (b === 0xffffff) return a
  let out = 0
  for (let shift = 16; shift >= 0; shift -= 8) out |= Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 255) << shift
  return out
}

/** Sprite2D 贴图层、Label 文字层的 label，用来和子节点的容器区分。 */
const CONTENT_LABEL = '__content'
const ANCHOR = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 } as const
