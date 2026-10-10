import type { CanvasLayerLike, Node } from './Node'
import { Node2D } from './Node2D'

/**
 * 与渲染层相同的绘制顺序（先画的在前）：layer < 0 的 CanvasLayer、场景（世界）、layer >= 0 的 CanvasLayer。
 * 同一 layer 的 CanvasLayer 按树的先序（不管 zIndex，嵌套的层紧跟在外层后面），和渲染层一致。
 * 每一层里是树的先序；非 Node2D 节点被展开到最近的 Node2D 祖先下；同一父容器内按 zIndex 稳定排序（zIndex 大的后画、在上层），
 * 节点自己排在 zIndex 0 的位置（zIndex 为负的子节点在它下面）。
 * `inLayer`（可选）和 `out` 一一对应：节点是否在某个 CanvasLayer 里。
 */
export function collectDrawOrder(nodes: readonly Node[], out: Node2D[], inLayer?: boolean[]): void {
  const layers: CanvasLayerLike[] = []
  collectLayers(nodes, layers)
  const sorted = layers.map((layer, index) => ({ layer, index })).sort((a, b) => a.layer.layer - b.layer.layer || a.index - b.index)
  const emit = (list: readonly Node[], flag: boolean) => {
    const start = out.length
    collectCanvas(list, out)
    if (inLayer) for (let i = start; i < out.length; i++) inLayer[i] = flag
  }
  for (const { layer } of sorted) if (layer.layer < 0) emit(layer.children, true)
  emit(nodes, false)
  for (const { layer } of sorted) if (layer.layer >= 0) emit(layer.children, true)
}

/** 树的先序里遇到的所有 CanvasLayer（包括嵌套的）。 */
function collectLayers(nodes: readonly Node[], out: CanvasLayerLike[]): void {
  for (const n of nodes) {
    if (n._isCanvasLayer) out.push(n as CanvasLayerLike)
    collectLayers(n.children, out)
  }
}

/**
 * 一个容器里的 Node2D，按绘制顺序；遇到 CanvasLayer 不展开（它自成一层）。
 * `self` 是容器所属的节点（画布的根容器为 null）：它自己的内容画在容器里 zIndex 0、同 zIndex 子节点之前的位置，
 * 所以 zIndex 为负的子节点画在父节点下面（和渲染层的内容层、Godot 的 z_index 一致）。
 */
function collectCanvas(nodes: readonly Node[], out: Node2D[], self: Node2D | null = null): void {
  const slots: Node2D[] = []
  const flatten = (list: readonly Node[]) => {
    for (const n of list) {
      if (n._isCanvasLayer) continue
      if (n instanceof Node2D) slots.push(n)
      else flatten(n.children)
    }
  }
  flatten(nodes)
  const items = slots.map((n, i) => ({ n, i, z: n.zIndex }))
  if (self) items.push({ n: self, i: -1, z: 0 })
  items.sort((a, b) => a.z - b.z || a.i - b.i)
  for (const { n, i } of items) {
    if (i === -1) out.push(n)
    else collectCanvas(n.children, out, n)
  }
}
