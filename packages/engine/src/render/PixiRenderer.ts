import { Container, Graphics, ImageSource, Rectangle, Sprite, Text, Texture as PixiTexture, WebGLRenderer, type TextStyleOptions } from 'pixi.js'
import type { Texture } from '../core/assets'
import type { Node } from '../core/Node'
import { Node2D } from '../core/Node2D'
import type { SceneTree } from '../core/SceneTree'
import type { Viewport } from '../core/Viewport'
import { Label } from '../nodes/Label'
import { Sprite2D } from '../nodes/Sprite2D'
import type { Renderer } from '../runtime/Game'

export interface PixiRendererOptions {
  /** 平台提供的画布（浏览器是 HTMLCanvasElement，小游戏是 wx 的上屏 canvas）。尺寸由视口决定。 */
  canvas: unknown
  background?: number
  /** 小游戏只能用 WebGL1（见 spikes/wechat/REPORT.md）。 */
  webglVersion?: 1 | 2
  /** 初始化期间这些 Pixi 警告降级为 console.debug（平台已知、无害的警告）。 */
  quietWarnings?: RegExp[]
}

/** 每个 Node2D 对应的显示对象。 */
interface View {
  /** 承载节点变换的容器；子节点的显示对象都挂在它下面。 */
  container: Container
  /** 上次同步时节点的 `_version`，相同则跳过。 */
  version: number
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
}

/**
 * 把场景树同步到 Pixi（见 ADR 0002）：
 * - 节点首次被渲染时才创建显示对象
 * - 只有 `_version` 变化的节点才更新变换和外观
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
  /** 整张图 → GPU 上的图片源，记下创建时用的资源：资源被卸载或替换后释放。图集的各帧共用整张图的源。 */
  private readonly _sources = new Map<Texture, { resource: unknown; source: ImageSource }>()
  /** 贴图句柄（整张图或子区域）→ Pixi 贴图；与图片源同时失效。 */
  private readonly _textures = new Map<Texture, { resource: unknown; texture: PixiTexture }>()

  /**
   * @internal 测试用：不初始化 WebGL，只做场景树到显示对象的同步（`sync()`），不能调用 `render()`。
   */
  static _createForSyncTests(): PixiRenderer {
    return new PixiRenderer(null as unknown as WebGLRenderer)
  }

  /** @internal 测试用：根容器。 */
  get _stage(): Container {
    return this._sceneContainer
  }

  private constructor(renderer: WebGLRenderer) {
    this._renderer = renderer
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
    return new PixiRenderer(renderer)
  }

  render(tree: SceneTree): void {
    this.sync(tree)
    this._renderer.render(this._root)
  }

  /** 只同步，不绘制。测试用。 */
  sync(tree: SceneTree): void {
    this._releaseUnloadedTextures()
    this._syncViewport(tree.viewport)
    const seen = new Set<Node2D>()
    this._syncChildren(tree._topLevel(), this._sceneContainer, seen)
    for (const [node, view] of this._views) {
      if (!seen.has(node)) this._destroyView(node, view)
    }
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
    for (const cached of this._textures.values()) cached.texture.destroy(false)
    for (const cached of this._sources.values()) cached.source.destroy()
    this._textures.clear()
    this._sources.clear()
    this._renderer?.destroy()
  }

  /** 同步一组兄弟节点，并让 `parent` 的子显示对象与它们的顺序一致。 */
  private _syncChildren(nodes: readonly Node[], parent: Container, seen: Set<Node2D>): void {
    const ordered: Container[] = []
    const visit = (node: Node) => {
      if (node instanceof Node2D) {
        seen.add(node)
        const view = this._syncNode(node)
        ordered.push(view.container)
        this._syncChildren(node.children, view.container, seen)
      } else {
        // 非 Node2D：自己不显示，子节点按顺序挂到当前容器
        for (const child of node.children) visit(child)
      }
    }
    for (const node of nodes) visit(node)

    // 保持顺序：Sprite2D / Label 的内容层永远在最前（最底层），之后是子节点的容器
    const fixed = parent.children.filter((c) => !ordered.includes(c as Container) && c.label === CONTENT_LABEL)
    const desired = [...fixed, ...ordered]
    const current = parent.children
    if (current.length !== desired.length || desired.some((c, i) => current[i] !== c)) {
      parent.removeChildren()
      if (desired.length) parent.addChild(...desired)
    }
  }

  private _syncNode(node: Node2D): View {
    let view = this._views.get(node)
    if (!view) {
      view = { container: new Container({ label: node.name }), version: -1 }
      view.container.sortableChildren = true
      if (node instanceof Sprite2D) {
        view.sprite = new Sprite({ label: CONTENT_LABEL })
        view.container.addChild(view.sprite)
      } else if (node instanceof Label) {
        view.text = new Text({ label: CONTENT_LABEL })
        view.container.addChild(view.text)
      }
      this._views.set(node, view)
      node._view = view.container
    }

    const textureResource = node instanceof Sprite2D ? node.texture?._resource : undefined
    if (view.version === node._version && view.textureResource === textureResource && (!view.text || view.textResolution === this._textResolution)) {
      return view
    }
    view.version = node._version

    const c = view.container
    c.position.set(node.x, node.y)
    c.rotation = node.rotation
    c.scale.set(node.scale.x, node.scale.y)
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
   * 资源被卸载（切换场景时）或替换后，立即销毁对应的 Pixi 贴图和图片源、释放显存——不等有精灵再次用到它。
   * 先于节点同步执行：此时引用它的精灵都已随旧场景销毁。
   */
  private _releaseUnloadedTextures(): void {
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
    const source = new ImageSource({ resource: resource as never })
    this._sources.set(base, { resource, source })
    return source
  }

  private _destroyView(node: Node2D, view: View): void {
    view.container.removeFromParent()
    view.sprite?.destroy()
    view.text?.destroy()
    view.container.destroy({ children: false })
    this._views.delete(node)
    if (node._view === view.container) node._view = null
  }
}

/** Sprite2D 贴图层、Label 文字层的 label，用来和子节点的容器区分。 */
const CONTENT_LABEL = '__content'
const ANCHOR = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 } as const
