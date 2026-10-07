import type { GroupRegistry } from '../index'
import type { Node } from './Node'

/**
 * 组名。GroupRegistry 为空时可以是任意字符串；在游戏里用声明合并注册之后，
 * 只能使用注册过的组名，`getNodesInGroup` 也会返回对应的节点类型：
 *
 * ```ts
 * declare module 'sapling2d' {
 *   interface GroupRegistry { fruits: Fruit }
 * }
 * ```
 */
export type GroupName = [keyof GroupRegistry] extends [never] ? string : Extract<keyof GroupRegistry, string>

/** 某个组里节点的类型；未注册的组是 Node。 */
export type GroupNodeType<K extends string> = K extends keyof GroupRegistry ? GroupRegistry[K] : Node
