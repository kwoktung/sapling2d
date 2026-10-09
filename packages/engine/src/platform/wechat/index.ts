// 必须最先执行：补齐 Pixi 加载时需要的全局对象（见 polyfills.ts）
import './polyfills'
import 'pixi.js/unsafe-eval'
import { DOMAdapter } from 'pixi.js'
import type { Scene } from '../../core/Scene'
import { PixiRenderer } from '../../render/PixiRenderer'
import { Game, type GameOptions } from '../../runtime/Game'
import { WechatAdapter } from './adapter'
import { screenCanvas } from './polyfills'
import { WechatPlatform } from './WechatPlatform'

export { WechatPlatform } from './WechatPlatform'

/**
 * 加载包内的字体文件（ttf / otf），返回字体名；之后把 Label 的 `fontFamily` 设为它。失败时返回 null。
 * 只在微信小游戏里可用（`wx.loadFont`）；浏览器里请用 CSS @font-face。路径相对于资源目录。
 *
 * ```ts
 * const family = loadFont('fonts/score.ttf') ?? 'sans-serif'
 * this.add(new Label({ text: '0', fontFamily: family }))
 * ```
 */
export function loadFont(path: string): string | null {
  return wx.loadFont(`assets/${path}`)
}

/**
 * 调试用：截取下一帧画面，发送到局域网日志服务（需要构建时设置 SAPLING_LOG_URL）。
 * `startLogServer` 会把截图保存成 PNG 文件，agent 可以直接查看真机画面。
 */
export function snapshot(label = 'snapshot'): void {
  const send = GameGlobal.__saplingLog as ((tag: string, data: unknown) => void) | undefined
  if (!send) {
    console.warn('[sapling2d] snapshot() needs SAPLING_LOG_URL at build time')
    return
  }
  // 在游戏本帧渲染之后的回调里读取：此时绘图缓冲区还没有被清空
  requestAnimationFrame(() => {
    requestAnimationFrame(() => send('snapshot', { label, dataUrl: screenCanvas.toDataURL() }))
  })
}

export interface WechatGameOptions<S extends Scene> extends GameOptions<S> {
  /** 背景色，默认黑色。 */
  background?: number
}

/**
 * 在微信小游戏里启动游戏。用法与浏览器的 `startGame` 相同，只是从 `sapling2d/wechat` 导入：
 *
 * ```ts
 * import { startGame } from 'sapling2d/wechat'
 * startGame({ main: GameScene })
 * ```
 *
 * 构建：在 Vite 配置里使用 `saplingWechat()`（见 sapling2d/vite），产出可以直接用微信开发者工具打开的目录。
 */
export async function startGame<S extends Scene>(options: WechatGameOptions<S>): Promise<Game<S>> {
  DOMAdapter.set(WechatAdapter)
  const platform = new WechatPlatform()
  const renderer = await PixiRenderer.create({
    canvas: platform.canvas,
    webglVersion: 1, // 小游戏只走 WebGL1（见 spikes/wechat/REPORT.md）
    // iOS 没有 OES_element_index_uint：批次超过 65535 个索引（约 1 万个精灵）才有影响，降级为 debug 日志
    quietWarnings: [/does not support 32 index buffer/],
    ...(options.background !== undefined ? { background: options.background } : {}),
    ...(options.pixelArt ? { pixelArt: true } : {}),
  })
  const game = await Game.create({ ...options, platform, renderer })
  game.start()
  return game
}
