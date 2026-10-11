/// <reference path="./wx.d.ts" />
import type { RawInputEvent } from '../../core/Input'
import type { ScreenInfo } from '../../core/Viewport'
import type { LoadedImage, Platform } from '../Platform'
import { _createClock } from './clock'
import { screenCanvas } from './polyfills'
import { _setCurrentAssetPaths, WechatAssetPaths, type WechatAssetManifest } from './assets'
import { WechatAudioBackend } from './audio'
import { WechatStorageBackend } from './storage'
import { subscribeTouches } from './touch'

/**
 * 微信小游戏平台。
 *
 * 时间、帧循环、屏幕信息、上屏 canvas、图片加载、触摸输入、音频、存储、前后台。
 * 各项的真机实测结论见 spikes/wechat/REPORT.md。
 */
export class WechatPlatform implements Platform {
  /** 资源从主包还是分包读（清单由 saplingWechat 构建时写入）。 */
  readonly assets = new WechatAssetPaths(wx, GameGlobal.__saplingAssets as WechatAssetManifest | undefined)
  readonly audio = new WechatAudioBackend(wx, this.assets)
  readonly storage = new WechatStorageBackend(wx)
  /** 上屏 canvas（第一次 wx.createCanvas() 的结果）。 */
  readonly canvas = screenCanvas
  private readonly _clock = _createClock(wx.getPerformance(), () => Date.now())

  constructor() {
    _setCurrentAssetPaths(this.assets)
  }

  /** 启动时下载资源分包（启动页显示之后、加载入口场景的资源之前）。 */
  prepareAssets(onProgress: (done: number) => void): Promise<void> {
    return this.assets.prepare(onProgress)
  }

  now(): number {
    return this._clock()
  }

  requestFrame(callback: (timeMs: number) => void): number {
    return requestAnimationFrame(() => callback(this.now()))
  }

  cancelFrame(id: number): void {
    cancelAnimationFrame(id)
  }

  getScreenInfo(): ScreenInfo {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const safe = info.safeArea
    return {
      width: info.windowWidth,
      height: info.windowHeight,
      pixelRatio: info.pixelRatio,
      ...(safe ? { safeArea: { left: safe.left, top: safe.top, right: safe.right, bottom: safe.bottom } } : {}),
    }
  }

  onScreenChange(callback: (screen: ScreenInfo) => void): () => void {
    const handler = () => callback(this.getScreenInfo())
    wx.onWindowResize(handler)
    return () => wx.offWindowResize?.(handler)
  }

  /** 包内文本文件（主包或资源分包）。 */
  loadText(path: string): Promise<string> {
    return this.assets.resolve(path).then(
      (file) =>
        new Promise((resolve, reject) => {
          wx.getFileSystemManager().readFile({
            filePath: file,
            encoding: 'utf8',
            success: (res) => resolve(String(res.data)),
            fail: (err) => reject(new Error(`cannot load ${file}: ${err.errMsg}`)),
          })
        }),
    )
  }

  /** 包内图片（构建时 public/assets 被拷贝到小游戏工程：`boot/` 在主包，其余在资源分包）。 */
  loadImage(path: string): Promise<LoadedImage> {
    return this.assets.resolve(path).then(
      (file) =>
        new Promise((resolve, reject) => {
          const img = wx.createImage()
          img.onload = () => resolve({ resource: img, width: img.width, height: img.height })
          img.onerror = (err) => reject(new Error(`cannot load ${file}: ${JSON.stringify(err)}`))
          img.src = file
        }),
    )
  }

  /** wx.onTouchStart / Move / End / Cancel → 统一的指针事件（多点触控）。小游戏没有键盘。 */
  onInput(callback: (event: RawInputEvent) => void): () => void {
    return subscribeTouches(wx, callback)
  }

  onFocusChange(callback: (focused: boolean) => void): () => void {
    const show = () => callback(true)
    const hide = () => callback(false)
    wx.onShow(show)
    wx.onHide(hide)
    return () => {
      wx.offShow?.(show)
      wx.offHide?.(hide)
    }
  }
}

