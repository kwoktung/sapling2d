import type { Container } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { CanvasLayer, ColorRect, Node, Node2D, rect, Scene, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import type { SceneTree } from '../src/core/SceneTree'
import { collectDrawOrder } from '../src/core/drawOrder'
import { PixiRenderer } from '../src/render/PixiRenderer'

/**
 * Pixi 实际的绘制顺序：场景容器的子对象依次画；每个容器的子对象按 zIndex 稳定排序（sortableChildren）后依次画。
 * 节点自己的内容层（第 0 个子对象）代表节点本身；没有内容层的节点放在 zIndex 0、最前面的位置（和内容层一样）。
 */
function renderOrder(r: PixiRenderer, tree: SceneTree): string[] {
  const byView = new Map<unknown, Node2D>()
  const index = (nodes: readonly Node[]) => {
    for (const n of nodes) {
      if (n instanceof Node2D && n.unsafePixi) byView.set(n.unsafePixi, n)
      index(n.children)
    }
  }
  index(tree._topLevel())
  const out: string[] = []
  const walk = (c: Container, self: Node2D | null) => {
    const kids = c.children.map((k, i) => ({ k: k as Container | null, i, z: k.zIndex }))
    const hasContent = kids[0]?.k?.label === '__content'
    if (self && !hasContent) kids.unshift({ k: null, i: -1, z: 0 })
    kids.sort((a, b) => a.z - b.z || a.i - b.i)
    for (const { k, i } of kids) {
      if (k === null || (hasContent && i === 0)) out.push(self!.name)
      else walk(k, byView.get(k) ?? null)
    }
  }
  for (const c of r._stage.parent!.children) walk(c as Container, null)
  return out
}

function pickOrder(tree: SceneTree): string[] {
  const out: Node2D[] = []
  collectDrawOrder(tree._topLevel(), out)
  return out.map((n) => n.name)
}

/** 随机场景树：Node2D、带内容的 ColorRect、不显示的 Node、各种 layer 的 CanvasLayer，zIndex 有正有负。 */
function randomTree(scene: Scene, seed: number): void {
  let s = seed
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!
  let id = 0
  const grow = (parent: Node, depth: number) => {
    const count = depth === 0 ? 4 : Math.floor(rnd() * 4)
    for (let i = 0; i < count; i++) {
      const name = `n${id++}`
      const r = rnd()
      const zIndex = pick([0, 0, 0, 1, 2, -1])
      const child: Node =
        r < 0.15 ? new Node({ name }) : r < 0.3 ? new CanvasLayer({ name, layer: pick([-1, 0, 1]) }) : r < 0.65 ? new ColorRect({ name, size: v(10, 10), zIndex }) : new Node2D({ name, zIndex })
      parent.add(child)
      if (depth < 3) grow(child, depth + 1)
    }
  }
  grow(scene, 0)
}

describe('绘制顺序', () => {
  it('拾取顺序（collectDrawOrder）和 Pixi 的渲染顺序一致', async () => {
    for (let seed = 1; seed <= 300; seed++) {
      class Main extends Scene {
        override ready() {
          randomTree(this, seed)
        }
      }
      const g = await createTestGame({ main: Main })
      g.step()
      const r = PixiRenderer._createForSyncTests()
      r.sync(g.tree)
      expect(pickOrder(g.tree), `seed ${seed}`).toEqual(renderOrder(r, g.tree))
    }
  })

  it('zIndex 为负的子节点画在父节点下面：父节点盖住它的地方，点中的是父节点', async () => {
    const g = await createTestGame({ main: Scene })
    g.step()
    const log: string[] = []
    const pickable = (name: string, zIndex: number) => {
      const n = new ColorRect({ name, size: v(100, 100), zIndex, inputPickable: true, hitArea: rect(0, 0, 100, 100) })
      n.pointerDown.connect(() => log.push(name))
      return n
    }
    const parent = g.scene.add(pickable('Parent', 0))
    parent.position = v(100, 100)
    parent.add(pickable('Below', -1))
    parent.add(pickable('Above', 1)).position = v(50, 50)
    g.step()
    g.tap(120, 120) // 只有 Parent 和 Below 重叠：Below 在父节点下面
    g.tap(170, 170) // 三个都重叠：Above 在最上面
    expect(log).toEqual(['Parent', 'Above'])
  })
})
