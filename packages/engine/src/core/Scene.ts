import type { AssetMap } from './assets'
import { Node2D } from './Node2D'

/**
 * 场景：场景树的根节点。一个游戏同一时间只有一个活动场景。
 *
 * ```ts
 * class GameScene extends Scene {
 *   player!: Player
 *   ready() {
 *     this.player = this.add(new Player({ position: v(100, 200) }))
 *   }
 * }
 * ```
 *
 * `static assets` 里声明的资源会在场景进入树之前加载完成，`ready()` 里可以直接使用。
 *
 * 场景参数通过构造函数声明，切换时由 `tree.changeScene` 传入并做类型检查：
 *
 * ```ts
 * class GameOver extends Scene {
 *   constructor(readonly params: { score: number }) {
 *     super()
 *   }
 * }
 * this.tree.changeScene(GameOver, { score: 120 })
 * ```
 */
export class Scene extends Node2D {
  /** 进入场景前需要加载的资源。子类覆写：`static assets = { fruit: tex('fruit.png') }`。 */
  static assets: AssetMap = {}
}

/** 可以无参构造的场景类（入口场景）。 */
export type SceneClass<T extends Scene = Scene> = (new () => T) & { assets?: AssetMap }

/** 任意场景类（构造参数即场景参数）。 */
export type SceneConstructor<T extends Scene = Scene> = (new (...args: any[]) => T) & { assets?: AssetMap }
