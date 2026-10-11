/// <reference path="./wx.d.ts" />

/**
 * 构建时生成的资源清单（`saplingWechat` 写到 `GameGlobal.__saplingAssets`）：
 * 主包里的资源在 `assets/`，其余资源在一个分包里（`subpackage.root`）。
 */
export interface WechatAssetManifest {
  /** 主包里的资源（相对于资源目录的路径）。 */
  main: string[]
  /** 资源分包；所有资源都在主包时为 null。 */
  subpackage: { name: string; root: string } | null
}

export type WxSubpackageApi = Pick<WechatMiniGame.Wx, 'loadSubpackage'>

/** 下载失败后再试几次。 */
const RETRIES = 2
const RETRY_DELAY_MS = 1000
/** 真机上最后一个进度事件的期望字节数是这个值（坏数据）。 */
const BOGUS_TOTAL = 0xffffffff

/**
 * 资源路径：决定一个资源从主包读还是从分包读，并负责下载分包（只下载一次）。
 *
 * - 读分包里的资源之前一律先等分包加载完：新版本安装后，加载前能读到上一个版本的分包文件（见 spikes/wechat-subpackage/REPORT.md）。
 * - 启动时 Game 先调用 `prepare()`（下载分包）再加载入口场景的资源；在那之前请求分包里的资源，说明是启动页用了不在主包里的资源，直接报错。
 * - 没有清单（不是 saplingWechat 构建的）时所有资源都在 `assets/`。
 */
export class WechatAssetPaths {
  private readonly _wx: WxSubpackageApi
  private readonly _main: ReadonlySet<string> | null
  private readonly _sub: { name: string; root: string } | null
  private _loading: Promise<void> | null = null
  private _loaded = false

  constructor(api: WxSubpackageApi, manifest: WechatAssetManifest | undefined) {
    this._wx = api
    this._main = manifest ? new Set(manifest.main) : null
    this._sub = manifest?.subpackage ?? null
  }

  /** 这个资源是否在分包里。 */
  inSubpackage(path: string): boolean {
    return this._sub !== null && this._main !== null && !this._main.has(path)
  }

  /** 读资源用的路径；在分包里时先等分包加载完。 */
  resolve(path: string): Promise<string> {
    if (!this.inSubpackage(path)) return Promise.resolve(`assets/${path}`)
    if (!this._loading) return Promise.reject(new Error(this._tooEarly(path)))
    return this._loading.then(() => this._subPath(path))
  }

  /** 同步版本（音乐、字体）：在分包里且分包还没加载完时报错。 */
  resolveNow(path: string): string {
    if (!this.inSubpackage(path)) return `assets/${path}`
    if (!this._loaded) throw new Error(this._tooEarly(path))
    return this._subPath(path)
  }

  /** 下载资源分包（只下载一次，失败时重试）。`onProgress` 汇报 0..1，只增不减。没有分包时立即完成。 */
  prepare(onProgress: (done: number) => void): Promise<void> {
    if (!this._loading) this._loading = this._sub ? this._download(this._sub.name, onProgress) : Promise.resolve()
    return this._loading
  }

  private async _download(name: string, onProgress: (done: number) => void): Promise<void> {
    let best = 0
    const report = (res: WechatMiniGame.SubpackageProgress) => {
      const total = res.totalBytesExpectedToWrite
      if (!(total > 0 && total < BOGUS_TOTAL) || !(res.totalBytesWritten >= 0)) return
      const done = Math.min(1, res.totalBytesWritten / total)
      if (done > best) onProgress((best = done))
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const task = this._wx.loadSubpackage({ name, success: resolve, fail: (err) => reject(new Error(err.errMsg)) })
          task?.onProgressUpdate?.(report)
        })
        break
      } catch (err) {
        if (attempt >= RETRIES) {
          throw new Error(`[sapling2d] failed to download the asset subpackage "${name}" after ${RETRIES + 1} attempts: ${err instanceof Error ? err.message : String(err)}`)
        }
        console.warn(`[sapling2d] downloading the asset subpackage "${name}" failed, retrying: ${err instanceof Error ? err.message : String(err)}`)
        await new Promise<void>((r) => setTimeout(r, RETRY_DELAY_MS))
      }
    }
    this._loaded = true
    if (best < 1) onProgress(1)
  }

  private _subPath(path: string): string {
    return `${this._sub!.root}${path}`
  }

  private _tooEarly(path: string): string {
    return (
      `[sapling2d] "${path}" is in the asset subpackage, which is downloaded after the loading screen appears. ` +
      `Assets used by the loading screen (or before startGame finishes) must be in the main package: put them in public/assets/boot/ (or change saplingWechat({ mainAssets })).`
    )
  }
}

let current: WechatAssetPaths | null = null

/** @internal 当前游戏的资源路径（WechatPlatform 创建时设置；`loadFont` 用）。 */
export function _currentAssetPaths(): WechatAssetPaths | null {
  return current
}

/** @internal */
export function _setCurrentAssetPaths(paths: WechatAssetPaths): void {
  current = paths
}
