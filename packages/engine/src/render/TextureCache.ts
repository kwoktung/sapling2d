import { ImageSource, Rectangle, Texture as PixiTexture } from 'pixi.js'
import type { Texture } from '../core/assets'

/**
 * 引擎贴图句柄 → Pixi 贴图和 GPU 上的图片源。整张图一个图片源，图集的各帧（子区域）共用它。
 * 每项都记下创建时用的资源：资源被卸载（切换场景时）或替换后，旧的贴图和图片源要销毁、释放显存。
 */
export class TextureCache {
  private readonly _pixelArt: boolean
  /** 整张图 → 图片源。 */
  private readonly _sources = new Map<Texture, { resource: unknown; source: ImageSource }>()
  /** 贴图句柄（整张图或子区域）→ Pixi 贴图；与图片源同时失效。 */
  private readonly _textures = new Map<Texture, { resource: unknown; texture: PixiTexture }>()

  /** `pixelArt`：图片源用最近邻采样。 */
  constructor(pixelArt: boolean) {
    this._pixelArt = pixelArt
  }

  /** 当前缓存的 Pixi 贴图数量（整张图和子区域各算一个）。 */
  get textureCount(): number {
    return this._textures.size
  }

  /** 当前 GPU 上的图片源数量（每张图一个，图集的帧共用）。 */
  get sourceCount(): number {
    return this._sources.size
  }

  /** 贴图句柄对应的 Pixi 贴图，按需创建；资源还没加载（或已卸载）时返回 `Texture.EMPTY`。 */
  get(texture: Texture): PixiTexture {
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

  /**
   * 资源被卸载或替换后，立即销毁对应的 Pixi 贴图和图片源、释放显存——不等有精灵再次用到它。
   * 调用方要保证此时没有显示对象或着色器还在用它们（见 `PixiRenderer.sync`）。
   */
  releaseUnloaded(): void {
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

  destroy(): void {
    for (const cached of this._textures.values()) cached.texture.destroy(false)
    for (const cached of this._sources.values()) cached.source.destroy()
    this._textures.clear()
    this._sources.clear()
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
}
