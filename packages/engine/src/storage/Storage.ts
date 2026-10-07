import type { StorageRegistry } from '../index'
import type { StorageBackend } from './backend'

/** 没有在 StorageRegistry 中注册任何 key 时，可以用任意字符串；注册之后只能用注册过的 key。 */
type UnregisteredKey = [keyof StorageRegistry] extends [never] ? string : never

/**
 * 持久化存储，通过 `this.tree.storage` 访问。同步读写，值用 JSON 序列化，key 自动加前缀。
 *
 * ```ts
 * const best = this.tree.storage.get('highScore', 0)
 * if (score > best) this.tree.storage.set('highScore', score)
 * ```
 *
 * 读取时，数据损坏或类型与默认值不一致（比如存档格式改过）都返回默认值。
 * 可以用声明合并给 key 和值加类型：
 *
 * ```ts
 * declare module 'sapling2d' {
 *   interface StorageRegistry { highScore: number; settings: { music: boolean } }
 * }
 * ```
 */
export class Storage {
  readonly prefix: string
  readonly #backend: StorageBackend

  /** @internal */
  constructor(backend: StorageBackend, prefix: string) {
    this.#backend = backend
    this.prefix = prefix
  }

  /** 读取；不存在、损坏或类型不符时返回 defaultValue。 */
  get<K extends keyof StorageRegistry & string>(key: K, defaultValue: StorageRegistry[K]): StorageRegistry[K]
  get<T>(key: UnregisteredKey, defaultValue: T): T
  get(key: string, defaultValue: unknown): unknown {
    let raw: string | null
    try {
      raw = this.#backend.getItem(this.prefix + key)
    } catch {
      return defaultValue
    }
    if (raw === null) return defaultValue
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      console.warn(`Storage: value of "${key}" is not valid JSON; using the default.`)
      return defaultValue
    }
    return sameShape(value, defaultValue) ? value : defaultValue
  }

  /** 写入；成功返回 true。值必须能被 JSON 序列化（不支持 Vector2 等类实例，请存成普通对象）。 */
  set<K extends keyof StorageRegistry & string>(key: K, value: StorageRegistry[K]): boolean
  set(key: UnregisteredKey, value: unknown): boolean
  set(key: string, value: unknown): boolean {
    try {
      this.#backend.setItem(this.prefix + key, JSON.stringify(value))
      return true
    } catch (err) {
      console.warn(`Storage: failed to save "${key}":`, err)
      return false
    }
  }

  has(key: (keyof StorageRegistry & string) | UnregisteredKey): boolean {
    try {
      return this.#backend.getItem(this.prefix + key) !== null
    } catch {
      return false
    }
  }

  remove(key: (keyof StorageRegistry & string) | UnregisteredKey): void {
    try {
      this.#backend.removeItem(this.prefix + key)
    } catch {
      // 忽略
    }
  }

  /** 本游戏（当前前缀下）保存的所有 key，不含前缀。 */
  keys(): string[] {
    try {
      return this.#backend
        .keys()
        .filter((k) => k.startsWith(this.prefix))
        .map((k) => k.slice(this.prefix.length))
    } catch {
      return []
    }
  }

  /** 删除本游戏（当前前缀下）的所有数据；不影响其他前缀。 */
  clear(): void {
    for (const k of this.keys()) this.#backend.removeItem(this.prefix + k)
  }
}

/** 读出的值与默认值是否是同一种类型（null / undefined 默认值不做限制）。 */
function sameShape(value: unknown, defaultValue: unknown): boolean {
  if (defaultValue === null || defaultValue === undefined) return true
  if (Array.isArray(defaultValue)) return Array.isArray(value)
  if (value === null || Array.isArray(value)) return false
  return typeof value === typeof defaultValue
}
