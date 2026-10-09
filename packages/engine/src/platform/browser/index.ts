import type { Scene } from '../../core/Scene'
import { PixiRenderer } from '../../render/PixiRenderer'
import { Game, type GameOptions } from '../../runtime/Game'
import { BrowserPlatform } from './BrowserPlatform'

export { BrowserPlatform, type BrowserPlatformOptions } from './BrowserPlatform'

export interface BrowserGameOptions<S extends Scene> extends GameOptions<S> {
  /** 渲染用的画布。不传时创建一个铺满窗口的画布加到 `document.body`。画布尺寸始终跟随窗口。 */
  canvas?: HTMLCanvasElement
  /** 背景色，默认黑色。 */
  background?: number
  /** 资源目录的 URL，默认 `assets/`。 */
  assetsBaseUrl?: string
}

/**
 * 在浏览器里启动游戏：创建画布和渲染器、加载入口场景的资源，然后开始帧循环。
 *
 * ```ts
 * import { startGame } from 'sapling2d/browser'
 * await startGame({ main: GameScene })
 * ```
 */
export async function startGame<S extends Scene>(options: BrowserGameOptions<S>): Promise<Game<S>> {
  const canvas = options.canvas ?? createFullscreenCanvas()
  const platform = new BrowserPlatform({ canvas, ...(options.assetsBaseUrl ? { assetsBaseUrl: options.assetsBaseUrl } : {}) })
  const renderer = await PixiRenderer.create({
    canvas,
    ...(options.background !== undefined ? { background: options.background } : {}),
    ...(options.pixelArt ? { pixelArt: true } : {}),
  })
  const game = await Game.create({ ...options, platform, renderer })
  game.start()
  return game
}

function createFullscreenCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;left:0;top:0;display:block;touch-action:none'
  document.body.style.margin = '0'
  document.body.style.overflow = 'hidden'
  document.body.appendChild(canvas)
  return canvas
}
