import { Node, type NodeOptions } from '../core/Node'

export interface CanvasLayerOptions extends NodeOptions {
  /** 绘制层级，默认 1。大于等于 0 画在场景上面（界面），小于 0 画在场景下面（远景）。相同层级按场景树里的顺序。 */
  layer?: number
  /** 默认 true。为 false 时整层不显示，也不能被点中。 */
  visible?: boolean
}

/**
 * 界面层：它下面的节点不跟随相机，固定在屏幕上（分数、按钮、暂停菜单），仍然随视口缩放。
 *
 * ```ts
 * class Level extends Scene {
 *   override ready() {
 *     const hud = this.add(new CanvasLayer())
 *     hud.add(new Label({ text: '分数 0', position: v(20, 20) }))   // 设计坐标，不受相机影响
 *   }
 * }
 * ```
 *
 * - 它下面的节点用设计坐标（屏幕上的位置）：全局变换只算到 CanvasLayer 为止，CanvasLayer 自己和它的祖先的变换都不起作用。
 * - `layer` 决定和场景谁画在上面，也决定点击的优先级：上面的层先收到指针事件。
 * - 指针事件里的 `position` 对它下面的节点是设计坐标（对场景里的节点是世界坐标）。
 * - 属于场景的 CanvasLayer 随场景销毁；作为 Autoload（或挂在 Autoload 下）时跨场景保留。
 */
export class CanvasLayer extends Node {
  layer: number
  visible: boolean

  constructor(options: CanvasLayerOptions = {}) {
    super(options)
    this.layer = options.layer ?? 1
    this.visible = options.visible ?? true
  }

  override get _isCanvasLayer(): boolean {
    return true
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), layer: this.layer, visible: this.visible ? undefined : false }
  }
}
