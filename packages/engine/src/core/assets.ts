import type { AudioServer } from '../audio/AudioServer'
import { AudioStream } from '../audio/AudioStream'
import type { Platform } from '../platform/Platform'

/**
 * 贴图资源句柄。用 `tex(path)` 创建，路径相对于游戏的资源目录（默认 `assets/`）。
 * 同一路径永远返回同一个句柄，所以可以在任何地方引用：
 *
 * ```ts
 * class GameScene extends Scene {
 *   static assets = { fruit: tex('fruit.png') }   // 进入场景前加载完成
 *   override ready() {
 *     this.add(new Sprite2D({ texture: GameScene.assets.fruit }))
 *   }
 * }
 * ```
 */
export class Texture {
  readonly kind = 'texture'
  #width = 0
  #height = 0
  #loaded = false
  /** @internal 平台加载出的原始图片对象（浏览器是 HTMLImageElement，小游戏是 wx Image）。 */
  _resource: unknown = null

  /** @internal 请使用 tex(path)。 */
  constructor(readonly path: string) {}

  /** 原始宽度（像素）；未加载或无头模式下为 0。 */
  get width(): number {
    return this.#width
  }

  get height(): number {
    return this.#height
  }

  get isLoaded(): boolean {
    return this.#loaded
  }

  /** @internal */
  _setLoaded(resource: unknown, width: number, height: number): void {
    this._resource = resource
    this.#width = width
    this.#height = height
    this.#loaded = true
  }

  /** @internal 释放图片；再次用到时需要重新加载。 */
  _unload(): void {
    this._resource = null
    this.#loaded = false
  }
}

const textureCache = new Map<string, Texture>()

/** 声明一张贴图。同一路径返回同一个句柄。 */
export function tex(path: string): Texture {
  let t = textureCache.get(path)
  if (!t) {
    t = new Texture(path)
    textureCache.set(path, t)
  }
  return t
}

/** 场景的 `static assets` 声明：贴图（tex）、音效（sfx）、音乐（music）。 */
export type AssetMap = Record<string, Texture | AudioStream>

const pending = new Map<Texture, Promise<void>>()

/** 加载一组资源；已加载的跳过，同一资源并发请求只加载一次。音乐是流式的，不预加载。 */
export async function loadAssets(assets: AssetMap | undefined, platform: Platform, audio: AudioServer): Promise<void> {
  if (!assets) return
  await Promise.all(
    Object.values(assets).map((asset) => {
      if (asset.isLoaded) return undefined
      if (asset instanceof AudioStream) {
        return audio._load(asset).catch((err: unknown) => {
          throw new Error(`Failed to load sound "${asset.path}": ${err instanceof Error ? err.message : String(err)}`)
        })
      }
      let p = pending.get(asset)
      if (!p) {
        p = platform.loadImage(asset.path).then(
          (img) => {
            asset._setLoaded(img.resource, img.width, img.height)
            pending.delete(asset)
          },
          (err: unknown) => {
            pending.delete(asset)
            throw new Error(`Failed to load texture "${asset.path}": ${err instanceof Error ? err.message : String(err)}`)
          },
        )
        pending.set(asset, p)
      }
      return p
    }),
  )
}
