import {
  compileHighShaderGlProgram,
  ImageSource,
  localUniformBitGl,
  Matrix,
  Mesh,
  MeshGeometry,
  Rectangle,
  RenderTexture,
  roundPixelsBitGl,
  Shader,
  textureBitGl,
  Texture as PixiTexture,
  type GlProgram,
  type TextureSource,
  type WebGLRenderer,
} from 'pixi.js'
import type { Texture } from '../core/assets'

/**
 * 引擎贴图句柄 → Pixi 贴图和 GPU 上的图片源。整张图一个图片源，图集的各帧（子区域）共用它。
 * 每项都记下创建时用的资源：资源被卸载（切换场景时）或替换后，旧的贴图和图片源要销毁、释放显存。
 *
 * 闪白（`Sprite2D.flash`）用的剪影也在这里：一张图第一次闪白时，在显存里把它画成一张白色剪影（`RenderTexture`），
 * 剪影的帧和原图的帧位置相同，所以图集的每一帧都能直接对应。
 */
export class TextureCache {
  private readonly _pixelArt: boolean
  /** 生成剪影要用渲染器；同步测试里没有渲染器（为 null），剪影是空贴图。 */
  private readonly _renderer: WebGLRenderer | null
  /** 整张图 → 白色剪影。 */
  private readonly _silhouettes = new Map<Texture, { resource: unknown; target: RenderTexture }>()
  /** 贴图句柄 → 剪影上对应的 Pixi 贴图。 */
  private readonly _flashTextures = new Map<Texture, { resource: unknown; texture: PixiTexture }>()
  /** 整张图 → 图片源。 */
  private readonly _sources = new Map<Texture, { resource: unknown; source: ImageSource }>()
  /** 贴图句柄（整张图或子区域）→ Pixi 贴图；与图片源同时失效。 */
  private readonly _textures = new Map<Texture, { resource: unknown; texture: PixiTexture }>()

  /** `pixelArt`：图片源用最近邻采样。 */
  constructor(pixelArt: boolean, renderer: WebGLRenderer | null = null) {
    this._pixelArt = pixelArt
    this._renderer = renderer
  }

  /** 当前的剪影数量（每张闪过白的图一个）。 */
  get silhouetteCount(): number {
    return this._silhouettes.size
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
    const created = frameTexture(texture, this._imageSource(texture._base ?? texture, resource))
    this._textures.set(texture, { resource, texture: created })
    return created
  }

  /**
   * 贴图句柄在白色剪影上对应的 Pixi 贴图（闪白用），按需创建：整张图的剪影第一次用到时才生成。
   * 资源还没加载、或没有渲染器（同步测试）时返回 `Texture.EMPTY`。
   */
  flash(texture: Texture): PixiTexture {
    const resource = texture._resource
    const cached = this._flashTextures.get(texture)
    if (cached && cached.resource === resource) return cached.texture
    if (cached) {
      cached.texture.destroy(false)
      this._flashTextures.delete(texture)
    }
    if (!resource || !this._renderer) return PixiTexture.EMPTY
    const created = frameTexture(texture, this._silhouette(texture._base ?? texture, resource))
    this._flashTextures.set(texture, { resource, texture: created })
    return created
  }

  /**
   * 资源被卸载或替换后，立即销毁对应的 Pixi 贴图和图片源、释放显存——不等有精灵再次用到它。
   * 调用方要保证此时没有显示对象或着色器还在用它们（见 `PixiRenderer.sync`）。
   */
  releaseUnloaded(): void {
    for (const [texture, cached] of this._flashTextures) {
      if (cached.resource !== texture._resource) {
        cached.texture.destroy(false)
        this._flashTextures.delete(texture)
      }
    }
    for (const [texture, cached] of this._silhouettes) {
      if (cached.resource !== texture._resource) {
        cached.target.destroy(true)
        this._silhouettes.delete(texture)
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

  destroy(): void {
    for (const cached of this._flashTextures.values()) cached.texture.destroy(false)
    for (const cached of this._silhouettes.values()) cached.target.destroy(true)
    this._flashTextures.clear()
    this._silhouettes.clear()
    for (const cached of this._textures.values()) cached.texture.destroy(false)
    for (const cached of this._sources.values()) cached.source.destroy()
    this._textures.clear()
    this._sources.clear()
  }

  /** 整张图的白色剪影：用着色器把每个像素画成 (a, a, a, a)（预乘透明度的白色），一次性画进 RenderTexture。 */
  private _silhouette(base: Texture, resource: unknown): TextureSource {
    const cached = this._silhouettes.get(base)
    if (cached && cached.resource === resource) return cached.target.source
    cached?.target.destroy(true)
    const source = this._imageSource(base, resource)
    const w = source.width
    const h = source.height
    const target = RenderTexture.create({ width: w, height: h, ...(this._pixelArt ? { scaleMode: 'nearest' as const } : {}) })
    const geometry = new MeshGeometry({
      positions: new Float32Array([0, 0, w, 0, w, h, 0, h]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      // iOS 小游戏的 WebGL1 没有 32 位索引
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]) as unknown as Uint32Array,
    })
    const shader = new Shader({
      glProgram: silhouetteProgram(),
      resources: { uTexture: source, uSampler: source.style, textureUniforms: { uTextureMatrix: { type: 'mat3x3<f32>', value: new Matrix() } } },
    })
    const mesh = new Mesh({ geometry, shader, texture: new PixiTexture({ source }) })
    this._renderer!.render({ container: mesh, target, clear: true, clearColor: [0, 0, 0, 0] })
    mesh.destroy()
    geometry.destroy()
    shader.destroy()
    this._silhouettes.set(base, { resource, target })
    return target.source
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

/** 贴图句柄在 `source` 上对应的 Pixi 贴图：子区域带上帧、原始尺寸和裁剪信息；整张图就是整个 source。 */
function frameTexture(texture: Texture, source: TextureSource): PixiTexture {
  const f = texture._frame
  return f
    ? new PixiTexture({
        source,
        frame: new Rectangle(f.region.x, f.region.y, f.region.width, f.region.height),
        orig: new Rectangle(0, 0, f.width, f.height),
        ...(f.trim ? { trim: new Rectangle(f.trim.x, f.trim.y, f.region.width, f.region.height) } : {}),
      })
    : new PixiTexture({ source })
}

let _silhouetteProgram: GlProgram | null = null
/**
 * 剪影着色器：和 Pixi 默认的 Mesh 着色器相同，最后把颜色换成透明度（预乘透明度的白色）。
 * `roundPixelsBitGl` 不能省：`localUniformBitGl` 用到它声明的 `uRound`，少了它着色器编译失败，而 Pixi 不报错、什么都不画。
 */
function silhouetteProgram(): GlProgram {
  return (_silhouetteProgram ??= compileHighShaderGlProgram({
    name: 'silhouette',
    bits: [localUniformBitGl, textureBitGl, roundPixelsBitGl, { name: 'silhouette-bit', fragment: { end: 'finalColor = vec4(finalColor.a);' } }],
  }))
}
