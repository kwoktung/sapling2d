import { Container, Graphics, WebGLRenderer } from 'pixi.js'
import type { CanvasLayerLike, Node } from '../core/Node'
import { Node2D } from '../core/Node2D'
import type { SceneTree } from '../core/SceneTree'
import type { Viewport } from '../core/Viewport'
import { Rect2 } from '../math/Rect2'
import type { Renderer } from '../runtime/Game'
import { createContent, type NodeContent, type SyncContext } from './NodeContent'
import { TextureCache } from './TextureCache'
import { TileMapRenderer } from './TileMapRenderer'

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
  /** 节点自己的内容（贴图、文字等），在容器的第 0 个；只有容器的 Node2D 为 null。 */
  content: NodeContent | null
}

/**
 * 把场景树同步到 Pixi（见 ADR 0002）：
 * - 节点首次被渲染时才创建显示对象
 * - 只有 `_transformVersion` / `_version` 变化的节点才分别更新变换 / 外观
 * - 每帧都要遍历整棵树，所以遍历本身不分配对象（iOS 小游戏上分配很贵，见 spikes/bullets/REPORT.md）
 * - 各节点类型自己的内容（贴图、文字、粒子、区块）见 `NodeContent`
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
  private readonly _views = new Map<Node2D, View>()
  /** 同步的帧号，和本帧同步到的显示对象数量（与 `_views.size` 相同说明没有节点离开树）。 */
  private _frame = 0
  private _seen = 0
  /** `_syncChildren` 每层递归复用的数组。 */
  private readonly _orderedByDepth: Container[][] = []
  /** 贴图句柄 → Pixi 贴图和图片源。 */
  private readonly _textures: TextureCache
  /** 节点内容同步时用的状态（可见区域、相机偏移、文字分辨率等）。 */
  private readonly _ctx: SyncContext
  /** CanvasLayer → 它的容器（挂在场景容器上，和世界容器并列，不受相机影响）。 */
  private readonly _layers = new Map<Node, { container: Container; frame: number }>()
  /** 本次同步遇到的 CanvasLayer，按遍历顺序（复用）。 */
  private readonly _layerOrder: CanvasLayerLike[] = []
  /** 场景容器子对象的期望顺序（复用）。 */
  private readonly _sceneOrder: Container[] = []
  /** 外层有几个隐藏的 CanvasLayer：大于 0 时里面嵌套的层也隐藏。 */
  private _hiddenLayers = 0
  /** TileMapLayer 的区块渲染（共用一个，持有图块集的着色器）。 */
  private readonly _tileMaps: TileMapRenderer
  /**
   * 像素风：图片源用最近邻采样，相机平移对齐到物理像素；贴图层打开 Pixi 的 `roundPixels`（见 `NodeContent`）。
   * 只对贴图层打开，不对整个渲染器：文字、Graphics 和视口遮罩不受影响。
   */
  private readonly _pixelArt: boolean

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
    this._textures = new TextureCache(pixelArt, renderer)
    this._tileMaps = new TileMapRenderer({ pixelArt, compileShaders: !!renderer, textures: this._textures })
    this._ctx = { pixelArt, textures: this._textures, tileMaps: this._tileMaps, textResolution: 1, visibleRect: new Rect2(0, 0, 0, 0), offsetX: 0, offsetY: 0 }
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
    this._syncChildren(tree._topLevel(), this._worldContainer, 0, null)
    this._syncLayers(frame)
    if (this._seen === this._views.size) return
    // 有节点离开了树：销毁它们的显示对象（Map 的 forEach 里删除当前项是安全的）
    this._views.forEach((view, node) => {
      if (view.frame !== frame) this._destroyView(node, view)
    })
  }

  /** 相机的平移写到世界容器上。像素风时对齐到物理像素：相机慢慢移动时，静止的东西不会在相邻两个像素之间跳。 */
  private _syncCamera(viewport: Viewport): void {
    let x = viewport._canvasX
    let y = viewport._canvasY
    if (this._pixelArt) {
      const k = viewport.scale * viewport.renderResolution // 1 个设计像素 = k 个物理像素
      x = Math.round(x * k) / k
      y = Math.round(y * k) / k
    }
    // 世界容器里的节点用相机偏移；进入 CanvasLayer 时临时设成 0（见 _visitLayer）
    const ctx = this._ctx
    ctx.visibleRect = viewport.visibleRect
    ctx.offsetX = x
    ctx.offsetY = y
    this._worldContainer.position.set(x, y)
  }

  private _syncViewport(viewport: Viewport): void {
    if (viewport._version === this._viewportVersion) return
    this._viewportVersion = viewport._version
    const { width, height } = viewport.screen
    this._renderer?.resize(width, height, viewport.renderResolution)
    this._ctx.textResolution = viewport.renderResolution * viewport.scale
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
    // 先销毁绑着图片的区块着色器，再销毁图片源
    this._tileMaps.destroy()
    this._textures.destroy()
    this._renderer?.destroy()
  }

  /**
   * 同步一组兄弟节点，并让 `parent` 的子显示对象与它们的顺序一致。
   * `depth` 选用哪个复用数组：每层递归一个，同一层的兄弟调用依次复用（上一个用完才轮到下一个）。
   * `content`：`parent` 所属节点的内容（内容层永远在第 0 个、最底层，有覆盖层时紧跟在后面），没有时为 null。
   */
  private _syncChildren(nodes: readonly Node[], parent: Container, depth: number, content: NodeContent | null): void {
    const ordered = (this._orderedByDepth[depth] ??= [])
    ordered.length = 0
    for (let i = 0; i < nodes.length; i++) this._visit(nodes[i]!, ordered, depth)

    // 保持顺序：内容层、覆盖层（闪白）在前，之后是子节点的容器
    const current = parent.children
    const offset = contentCount(content)
    let inOrder = current.length === offset + ordered.length && (offset < 2 || current[1] === content!.overlay)
    for (let i = 0; inOrder && i < ordered.length; i++) inOrder = current[offset + i] === ordered[i]
    if (inOrder) return
    parent.removeChildren()
    if (content) parent.addChild(content.display)
    if (content?.overlay) parent.addChild(content.overlay)
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
    // 叶子节点（大多数子弹、精灵）不用递归：除非它的容器里还留着已经移走的子节点，或者内容刚多了覆盖层
    const content = view.content
    if (children.length > 0 || view.container.children.length !== contentCount(content)) this._syncChildren(children, view.container, depth + 1, content)
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
    // CanvasLayer 里没有相机偏移
    const ctx = this._ctx
    const offsetX = ctx.offsetX
    const offsetY = ctx.offsetY
    ctx.offsetX = 0
    ctx.offsetY = 0
    if (!node.visible) this._hiddenLayers++
    this._syncChildren(node.children, entry.container, depth + 1, null)
    if (!node.visible) this._hiddenLayers--
    ctx.offsetX = offsetX
    ctx.offsetY = offsetY
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
      const container = new Container({ label: node.name })
      container.sortableChildren = true
      const content = createContent(node, this._ctx)
      if (content) container.addChild(content.display)
      view = { container, transformVersion: -1, version: -1, frame: 0, content }
      this._views.set(node, view)
      node._view = container
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

    const changed = view.version !== node._version
    if (changed) {
      view.version = node._version
      c.visible = node.visible
      c.zIndex = node.zIndex
      c.alpha = node.alpha
      c.tint = node.modulate // Pixi v8 的容器 tint 会乘到所有子对象上
      c.blendMode = node.blendMode // 'inherit' 时跟随父容器：和 Pixi 的默认值一致，叠加作用到整棵子树
    }
    view.content?.sync(node, this._ctx, changed)
    return view
  }

  /**
   * 资源被卸载（切换场景时）或替换后，立即销毁对应的 Pixi 贴图和图片源、释放显存——不等有精灵再次用到它。
   * 先于节点同步执行：此时引用它的精灵都已随旧场景销毁。
   */
  private _releaseUnloadedTextures(): void {
    // 先销毁绑着这张图的区块着色器，再销毁图片源（否则 Pixi 会警告）
    this._tileMaps.releaseUnloaded()
    this._textures.releaseUnloaded()
  }

  /** @internal 测试用：当前缓存的 Pixi 贴图数量（整张图和子区域各算一个）。 */
  get _textureCount(): number {
    return this._textures.textureCount
  }

  /** @internal 测试用：区块着色器的数量（每张图块集图片一个）。 */
  get _tileShaderCount(): number {
    return this._tileMaps.shaderCount
  }

  /** @internal 测试用：当前 GPU 上的图片源数量（每张图一个，图集的帧共用）。 */
  get _sourceCount(): number {
    return this._textures.sourceCount
  }

  private _destroyView(node: Node2D, view: View): void {
    view.container.removeFromParent()
    view.content?.destroy()
    view.container.destroy({ children: false })
    this._views.delete(node)
    if (node._view === view.container) node._view = null
  }
}

/** 节点容器开头属于节点自己内容的显示对象个数：内容层 + 覆盖层（有的话）。 */
function contentCount(content: NodeContent | null): number {
  return content ? (content.overlay ? 2 : 1) : 0
}
