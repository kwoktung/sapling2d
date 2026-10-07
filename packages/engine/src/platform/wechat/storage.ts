import type { StorageBackend } from '../../storage/backend'

/** wx 存储 API 中引擎用到的部分（作为参数传入，方便测试）。 */
export interface WxStorageApi {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
  removeStorageSync(key: string): void
  getStorageInfoSync(): { keys: string[] }
}

/**
 * 微信本地存储（同步 API）。单个小游戏上限 10MB。
 * `wx.getStorageSync` 对不存在的 key 返回空字符串；引擎存的值都是 JSON（不会是空串），所以 '' 视为不存在。
 */
export class WechatStorageBackend implements StorageBackend {
  readonly #wx: WxStorageApi

  constructor(api: WxStorageApi) {
    this.#wx = api
  }

  getItem(key: string): string | null {
    const value = this.#wx.getStorageSync(key)
    return typeof value === 'string' && value !== '' ? value : null
  }

  setItem(key: string, value: string): void {
    this.#wx.setStorageSync(key, value)
  }

  removeItem(key: string): void {
    this.#wx.removeStorageSync(key)
  }

  keys(): string[] {
    return this.#wx.getStorageInfoSync().keys
  }
}
