import type { ActionRegistry } from '../index'

/**
 * 输入动作名。ActionRegistry 为空时可以是任意字符串；在游戏里用声明合并注册之后，
 * 只能使用注册过的动作名：
 *
 * ```ts
 * declare module 'sapling2d' {
 *   interface ActionRegistry { drop: true; pause: true }
 * }
 * ```
 */
export type ActionName = [keyof ActionRegistry] extends [never] ? string : Extract<keyof ActionRegistry, string>
