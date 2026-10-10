import { Matrix, Particle, ParticleContainer, Sprite, Text, Texture as PixiTexture, type Container, type TextStyleOptions } from 'pixi.js'
// ParticleContainer 的渲染管线是可选扩展（skipExtensionImports 不会自动加载）
import 'pixi.js/particle-container'
import type { Texture } from '../core/assets'
import type { Node2D } from '../core/Node2D'
import { invertAffine } from '../math/Affine'
import type { Rect2 } from '../math/Rect2'
import { ColorRect } from '../nodes/ColorRect'
import { Label } from '../nodes/Label'
import { Particles2D } from '../nodes/Particles2D'
import { Sprite2D } from '../nodes/Sprite2D'
import { TileMapLayer } from '../nodes/TileMapLayer'
import type { TextureCache } from './TextureCache'
import type { TileMapRenderer, TileView } from './TileMapRenderer'

/** 同步节点内容时用到的渲染器状态。渲染器持有一个，每次同步前更新。 */
export interface SyncContext {
  /** 像素风：贴图层打开 Pixi 的 `roundPixels`（顶点对齐到物理像素），图块 uv 不内缩。 */
  readonly pixelArt: boolean
  readonly textures: TextureCache
  readonly tileMaps: TileMapRenderer
  /** 文字的栅格化分辨率：渲染分辨率 × 视口缩放，保证文字在任何屏幕上都按实际像素清晰绘制。 */
  textResolution: number
  /** 屏幕上可见的区域（设计坐标），用来裁剪 TileMapLayer 的区块。 */
  visibleRect: Rect2
  /** 正在同步的节点所在画布的相机偏移（世界坐标 + 偏移 = 设计坐标）；CanvasLayer 里为 0。 */
  offsetX: number
  offsetY: number
}

/**
 * 节点自己的显示内容（贴图、文字、粒子、区块）。放在节点容器的第 0 个（最底层），之后是子节点的容器；
 * 节点的变换、可见性、透明度和 modulate 在容器上，内容只管自己的部分。
 */
export interface NodeContent {
  /** 内容层的显示对象。 */
  readonly display: Container
  /** 画在内容层上面、子节点下面的覆盖层（Sprite2D 闪白的剪影）；第一次用到时才创建，没有时为 null 或不定义。 */
  readonly overlay?: Container | null
  /**
   * 每帧对每个有内容的节点调用（遍历整棵树的热路径：不分配内存）。
   * `changed`：节点的 `_version` 变了。没变时只检查自己额外关心的状态（贴图加载完成、文字分辨率、每帧都动的粒子等）。
   */
  sync(node: Node2D, ctx: SyncContext, changed: boolean): void
  destroy(): void
}

/** 节点类型 → 内容。新的可显示节点类型在这里加一行；没有内容的 Node2D 返回 null（只有容器）。 */
export function createContent(node: Node2D, ctx: SyncContext): NodeContent | null {
  if (node instanceof Sprite2D) return new SpriteContent(ctx)
  if (node instanceof ColorRect) return new ColorRectContent(ctx)
  if (node instanceof Label) return new LabelContent()
  if (node instanceof Particles2D) return new ParticlesContent(ctx)
  if (node instanceof TileMapLayer) return new TileMapContent(node, ctx)
  return null
}

/** 内容层的 label，调试时和子节点的容器区分。 */
const CONTENT_LABEL = '__content'
const OVERLAY_LABEL = '__flash'

/**
 * Sprite2D：offset、centered、flip 作用在贴图层上，不影响子节点。
 * 闪白（`flash > 0`）：覆盖层是同一帧的白色剪影（`TextureCache.flash`），染成 `flashColor`、透明度是 `flash`；
 * 第一次闪白时才创建，之后不闪时隐藏（大多数精灵从不闪白，不多一个显示对象）。
 */
class SpriteContent implements NodeContent {
  readonly display: Sprite
  overlay: Sprite | null = null
  /** 上次同步时贴图句柄背后的资源，用来发现“贴图后来才加载完成”。 */
  private _resource: unknown = undefined
  private readonly _pixelArt: boolean

  constructor(ctx: SyncContext) {
    this.display = new Sprite({ label: CONTENT_LABEL, roundPixels: ctx.pixelArt })
    this._pixelArt = ctx.pixelArt
  }

  sync(node: Sprite2D, ctx: SyncContext, changed: boolean): void {
    const resource = node.texture?._resource
    if (!changed && resource === this._resource) return
    this._resource = resource
    const s = this.display
    s.texture = node.texture ? ctx.textures.get(node.texture) : PixiTexture.EMPTY
    // centered：有锚点（TexturePacker 的 pivot）用锚点，否则用中心；锚点和 Pixi 的 anchor 一样相对裁剪前的原始尺寸
    const pivot = node.centered ? (node.texture?.pivot ?? null) : null
    if (pivot) s.anchor.set(pivot.x, pivot.y)
    else s.anchor.set(node.centered ? 0.5 : 0)
    s.position.set(node.offset.x, node.offset.y)
    s.scale.set(node.flipH ? -1 : 1, node.flipV ? -1 : 1)
    s.tint = node.selfModulate

    const flash = node.flash
    if (flash <= 0 && !this.overlay) return
    const o = (this.overlay ??= new Sprite({ label: OVERLAY_LABEL, roundPixels: this._pixelArt }))
    o.visible = flash > 0 && node.texture !== null
    if (!o.visible) return
    o.texture = ctx.textures.flash(node.texture!)
    o.anchor.copyFrom(s.anchor)
    o.position.copyFrom(s.position)
    o.scale.copyFrom(s.scale)
    o.tint = node.flashColor
    o.alpha = flash
  }

  destroy(): void {
    this.display.destroy()
    this.overlay?.destroy()
  }
}

/** ColorRect：白色贴图染色，和普通贴图一起合批，不用 Graphics。 */
class ColorRectContent implements NodeContent {
  readonly display: Sprite

  constructor(ctx: SyncContext) {
    this.display = new Sprite({ label: CONTENT_LABEL, texture: PixiTexture.WHITE, roundPixels: ctx.pixelArt })
  }

  sync(node: ColorRect, _ctx: SyncContext, changed: boolean): void {
    if (!changed) return
    const s = this.display
    const size = node.size
    s.width = size.x
    s.height = size.y
    s.tint = multiplyColor(node.color, node.selfModulate)
  }

  destroy(): void {
    this.display.destroy()
  }
}

class LabelContent implements NodeContent {
  readonly display = new Text({ label: CONTENT_LABEL })
  /** 上次应用的文字样式；Pixi 每次设置样式都会重绘文字贴图，所以只在真正变化时才设置。 */
  private _styleKey: string | undefined = undefined
  /** 上次应用的文字分辨率。 */
  private _resolution: number | undefined = undefined

  sync(node: Label, ctx: SyncContext, changed: boolean): void {
    if (!changed && this._resolution === ctx.textResolution) return
    const text = this.display
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
    if (styleKey !== this._styleKey) {
      text.style = style
      this._styleKey = styleKey
    }
    text.text = node.text // 相同字符串时 Pixi 不会重绘
    if (this._resolution !== ctx.textResolution) {
      text.resolution = ctx.textResolution
      this._resolution = ctx.textResolution
    }
    text.anchor.set(ANCHOR[node.align], ANCHOR[node.verticalAlign])
    text.tint = node.selfModulate
  }

  destroy(): void {
    this.display.destroy()
  }
}

/**
 * Particles2D：一个 ParticleContainer（一次绘制调用），粒子对象按需创建、复用。
 * 粒子每帧都在动：每帧同步（隐藏时跳过）。每帧只写数字，不分配；粒子数第一次达到某个值时才创建对象。
 * 全局坐标的粒子：内容层的变换设成节点全局变换的逆，抵消掉节点自己的移动，粒子画在全局坐标上。
 */
class ParticlesContent implements NodeContent {
  readonly display: ParticleContainer
  private readonly _pool: Particle[] = []
  /** 粒子当前用的贴图（节点的贴图句柄和背后的资源都要比较）。 */
  private _texture: Texture | null = null
  private _resource: unknown = null
  private _tint = -1

  constructor(ctx: SyncContext) {
    this.display = new ParticleContainer({
      label: CONTENT_LABEL,
      // 位置、缩放（在 vertex 里）、透明度每帧都变；贴图坐标不变，粒子不旋转
      dynamicProperties: { position: true, vertex: true, color: true, rotation: false, uvs: false },
      roundPixels: ctx.pixelArt,
    })
  }

  sync(node: Particles2D, ctx: SyncContext): void {
    if (!node.visible) return
    const pc = this.display
    const texture = node.texture
    const resource = texture?._resource
    const n = texture ? node._count : 0
    const pool = this._pool
    if (texture !== this._texture || resource !== this._resource) {
      this._texture = texture
      this._resource = resource
      const t = texture ? ctx.textures.get(texture) : PixiTexture.EMPTY
      pc.texture = t
      for (let i = 0; i < pool.length; i++) pool[i]!.texture = t
      pc.update()
    }
    const tint = node.selfModulate
    if (tint !== this._tint) {
      this._tint = tint
      for (let i = 0; i < pool.length; i++) pool[i]!.tint = tint
    }
    while (pool.length < n) pool.push(new Particle({ texture: pc.texture ?? PixiTexture.EMPTY, anchorX: 0.5, anchorY: 0.5, tint }))

    if (node.localCoords) {
      if (pc.x !== 0 || pc.y !== 0 || pc.rotation !== 0 || pc.scale.x !== 1 || pc.scale.y !== 1 || pc.skew.x !== 0 || pc.skew.y !== 0) {
        pc.setFromMatrix(_particleMatrix.identity())
      }
    } else {
      node._computeGlobal()
      if (!invertAffine(node._global, _particleMatrix)) {
        pc.visible = false
        return
      }
      pc.visible = true
      pc.setFromMatrix(_particleMatrix)
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

  destroy(): void {
    this.display.destroy()
  }
}

/**
 * TileMapLayer：区块由 `TileMapRenderer` 管理（ADR 0008）。
 * 区块的显示和重建每帧都要检查：镜头或视口变化时不会改节点的版本号。隐藏的图层不建区块；重新显示后再同步。
 */
class TileMapContent implements NodeContent {
  readonly display: Container
  private readonly _view: TileView
  private readonly _tileMaps: TileMapRenderer

  constructor(node: TileMapLayer, ctx: SyncContext) {
    this._tileMaps = ctx.tileMaps
    this._view = ctx.tileMaps.createView(node, CONTENT_LABEL)
    this.display = this._view.content
  }

  sync(node: TileMapLayer, ctx: SyncContext): void {
    if (node.visible) this._tileMaps.sync(node, this._view, ctx.visibleRect, ctx.offsetX, ctx.offsetY)
  }

  destroy(): void {
    this._tileMaps.destroyView(this._view)
  }
}

/** 粒子内容层的变换（复用：同步是单线程的，算完马上写进容器）。 */
const _particleMatrix = new Matrix()

const ANCHOR = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 } as const

/** 两个 0xRRGGBB 按通道相乘（和 GPU 里染色的效果一样）。 */
function multiplyColor(a: number, b: number): number {
  if (b === 0xffffff) return a
  let out = 0
  for (let shift = 16; shift >= 0; shift -= 8) out |= Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 255) << shift
  return out
}
