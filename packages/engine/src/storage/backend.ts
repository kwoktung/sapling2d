/** 平台的键值存储（字符串）。浏览器是 localStorage，小游戏是 wx.*StorageSync。 */
export interface StorageBackend {
  getItem(key: string): string | null
  /** 写入失败（比如超出配额）时抛错。 */
  setItem(key: string, value: string): void
  removeItem(key: string): void
  /** 所有 key（含其他游戏或前缀的）。 */
  keys(): string[]
}

/** 内存实现：无头模式，以及 localStorage 不可用时的后备。 */
export class MemoryStorageBackend implements StorageBackend {
  private readonly _data = new Map<string, string>()

  getItem(key: string): string | null {
    return this._data.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this._data.set(key, value)
  }

  removeItem(key: string): void {
    this._data.delete(key)
  }

  keys(): string[] {
    return [...this._data.keys()]
  }
}
