import { describe, expect, it } from 'vitest'
import { Node, Node2D, Scene, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

/** 记录生命周期调用顺序的节点 */
const calls: string[] = []
class Probe extends Node2D {
  override enterTree() {
    calls.push(`enter:${this.name}`)
  }
  override ready() {
    calls.push(`ready:${this.name}`)
  }
  override exitTree() {
    calls.push(`exit:${this.name}`)
  }
}

describe('lifecycle', () => {
  it('enterTree 父先于子，ready 子先于父，exitTree 子先于父', async () => {
    calls.length = 0
    class Main extends Scene {
      override ready() {
        calls.push('ready:Main')
      }
    }
    const scene = new Main()
    const a = scene.add(new Probe({ name: 'A' }))
    a.add(new Probe({ name: 'A1' }))
    scene.add(new Probe({ name: 'B' }))

    const g = await createTestGame({ main: class extends Scene {} })
    g.tree._setScene(scene)
    expect(calls).toEqual(['enter:A', 'enter:A1', 'enter:B', 'ready:A1', 'ready:A', 'ready:B', 'ready:Main'])

    calls.length = 0
    scene.remove(a)
    expect(calls).toEqual(['exit:A1', 'exit:A'])
  })

  it('在树里 add 的节点立刻收到 enterTree 和 ready；ready 一生只调用一次', async () => {
    calls.length = 0
    const g = await createTestGame({ main: Scene })
    const p = g.scene.add(new Probe({ name: 'P' }))
    expect(calls).toEqual(['enter:P', 'ready:P'])

    calls.length = 0
    g.scene.remove(p)
    g.scene.add(p)
    expect(calls).toEqual(['exit:P', 'enter:P'])
    expect(p.isReady).toBe(true)
  })

  it('在 ready() 和 enterTree() 里 add 子节点都只进入树一次', async () => {
    calls.length = 0
    class Parent extends Node2D {
      override enterTree() {
        this.add(new Probe({ name: 'FromEnter' }))
      }
      override ready() {
        this.add(new Probe({ name: 'FromReady' }))
      }
    }
    const g = await createTestGame({ main: Scene })
    g.scene.add(new Parent())
    expect(calls).toEqual(['enter:FromEnter', 'ready:FromEnter', 'enter:FromReady', 'ready:FromReady'])
  })

  it('add 返回带类型的子节点；不在树里访问 tree 会给出明确报错', () => {
    class Player extends Node2D {
      hp = 3
    }
    const scene = new Scene()
    const player = scene.add(new Player())
    expect(player.hp).toBe(3)
    expect(() => player.tree).toThrow(/not inside the scene tree/)
  })

  it('不允许一个节点有两个父节点，也不允许成环', () => {
    const a = new Node({ name: 'a' })
    const b = new Node({ name: 'b' })
    const child = a.add(new Node({ name: 'c' }))
    expect(() => b.add(child)).toThrow(/already has a parent/)
    expect(() => child.add(a)).toThrow(/own ancestor/)
  })

  it('同名兄弟节点自动加数字后缀', () => {
    const root = new Node()
    const names = [root.add(new Node({ name: 'Fruit' })), root.add(new Node({ name: 'Fruit' })), root.add(new Node({ name: 'Fruit' }))].map((n) => n.name)
    expect(names).toEqual(['Fruit', 'Fruit2', 'Fruit3'])
  })

  it('重名检查在移除、改名后保持正确；后缀只增不减', () => {
    const root = new Node()
    const a = root.add(new Node({ name: 'Fruit' }))
    const b = root.add(new Node({ name: 'Fruit' }))
    root.remove(a)
    expect(root.add(new Node({ name: 'Fruit' })).name).toBe('Fruit') // 'Fruit' 已空出
    expect(root.add(new Node({ name: 'Fruit' })).name).toBe('Fruit3')
    b.name = 'Apple'
    expect(root.add(new Node({ name: 'Fruit2' })).name).toBe('Fruit2') // 改名后旧名字空出
    b.name = 'Apple' // 改成自己现在的名字：不加后缀
    expect(b.name).toBe('Apple')
    expect(root.add(new Node({ name: 'Apple' })).name).toBe('Apple2')
  })

  it('同一父节点下大量同名节点：add 不随兄弟数量变慢（不是平方级）', () => {
    const time = (n: number) => {
      const root = new Node()
      const t = performance.now()
      for (let i = 0; i < n; i++) root.add(new Node({ name: 'Bullet' }))
      return performance.now() - t
    }
    time(2000) // 预热
    // 修复前 4000 个约需数秒（每次 add 都从 2 开始逐个扫描兄弟）；现在是毫秒级
    expect(time(4000)).toBeLessThan(200)
  })
})

describe('physicsProcess 节点计数', () => {
  it('只统计覆写了 physicsProcess 的节点；进出树时增减，物理步只在有这类节点时遍历', async () => {
    let calls = 0
    class Mover extends Node {
      override physicsProcess() {
        calls++
      }
    }
    const g = await createTestGame({ main: Scene })
    g.scene.add(new Node())
    expect(g.tree._physicsProcessNodes).toBe(0)
    const holder = g.scene.add(new Node())
    holder.add(new Mover())
    holder.add(new Mover())
    expect(g.tree._physicsProcessNodes).toBe(2)
    g.step(3)
    expect(calls).toBe(6)
    g.scene.remove(holder)
    expect(g.tree._physicsProcessNodes).toBe(0)
    g.scene.add(holder) // 重新进入树
    expect(g.tree._physicsProcessNodes).toBe(2)
    holder.queueFree()
    g.step()
    expect(g.tree._physicsProcessNodes).toBe(0)
  })
})

describe('main loop', () => {
  class Counter extends Node {
    processCalls: number[] = []
    physicsCalls: number[] = []
    override process(dt: number) {
      this.processCalls.push(dt)
    }
    override physicsProcess(dt: number) {
      this.physicsCalls.push(dt)
    }
  }

  it('step(n) 恰好推进 n 次物理步和 n 次 process，dt 为 1/60', async () => {
    const g = await createTestGame({ main: Scene })
    const c = g.scene.add(new Counter())
    g.step(600)
    expect(c.physicsCalls).toHaveLength(600)
    expect(c.processCalls).toHaveLength(600)
    expect(c.physicsCalls.every((dt) => dt === 1 / 60)).toBe(true)
    expect(g.tree.time).toBeCloseTo(10)
  })

  it('物理是固定步长：30fps 的帧每帧跑 2 次物理', async () => {
    const g = await createTestGame({ main: Scene })
    const c = g.scene.add(new Counter())
    for (let i = 0; i < 30; i++) g.tree.advance(1 / 30)
    expect(c.processCalls).toHaveLength(30)
    expect(c.physicsCalls).toHaveLength(60)
  })

  it('一帧最多补 2 次物理，超出的时间丢弃而不是越积越多', async () => {
    const g = await createTestGame({ main: Scene })
    const c = g.scene.add(new Counter())
    g.tree.advance(0.2) // 相当于 12 个物理步
    expect(c.physicsCalls).toHaveLength(2)
    g.tree.advance(1 / 60)
    expect(c.physicsCalls).toHaveLength(3)
  })

  it('先 physicsProcess 后 process；父节点先于子节点', async () => {
    const order: string[] = []
    class N extends Node {
      override physicsProcess() {
        order.push(`physics:${this.name}`)
      }
      override process() {
        order.push(`process:${this.name}`)
      }
    }
    const g = await createTestGame({ main: Scene })
    g.scene.add(new N({ name: 'parent' })).add(new N({ name: 'child' }))
    g.step()
    expect(order).toEqual(['physics:parent', 'physics:child', 'process:parent', 'process:child'])
  })

  it('本帧新加的节点从下一帧开始 process', async () => {
    const g = await createTestGame({ main: Scene })
    let spawned: Counter | null = null
    class Spawner extends Node {
      override process() {
        spawned ??= this.add(new Counter())
      }
    }
    g.scene.add(new Spawner())
    g.step()
    expect(spawned!.processCalls).toHaveLength(0)
    g.step()
    expect(spawned!.processCalls).toHaveLength(1)
  })
})

describe('rand', () => {
  it('同一个 seed 得到同样的序列，不同 seed 不同', async () => {
    const seq = async (seed: number) => {
      const g = await createTestGame({ main: Scene, seed })
      return Array.from({ length: 5 }, () => g.tree.rand())
    }
    expect(await seq(42)).toEqual(await seq(42))
    expect(await seq(42)).not.toEqual(await seq(43))
    const g = await createTestGame({ main: Scene })
    for (let i = 0; i < 1000; i++) {
      const n = g.tree.rng.randiRange(1, 6)
      expect(n >= 1 && n <= 6 && Number.isInteger(n)).toBe(true)
    }
  })
})

describe('dump', () => {
  class Player extends Node2D {}
  class GameScene extends Scene {
    player!: Player
    override ready() {
      this.player = this.add(new Player({ position: v(100, 200), rotation: Math.PI / 2 }))
      this.add(new Node2D({ name: 'Hidden', visible: false, zIndex: 3, scale: v(2, 2) }))
    }
  }

  it('缩进文本：名字、类名和关键属性，默认值省略', async () => {
    const g = await createTestGame({ main: GameScene })
    expect(g.dump()).toBe(
      [
        'GameScene (GameScene) position=(0, 0)',
        '  Player (Player) position=(100, 200) rotationDegrees=90',
        '  Hidden (Node2D) position=(0, 0) scale=(2, 2) visible=false zIndex=3',
      ].join('\n'),
    )
  })

  it('JSON 结构', async () => {
    const g = await createTestGame({ main: GameScene })
    g.scene.player.x += 5
    expect(g.dump({ json: true })).toEqual([{
      type: 'GameScene',
      name: 'GameScene',
      props: { position: '(0, 0)' },
      children: [
        { type: 'Player', name: 'Player', props: { position: '(105, 200)', rotationDegrees: 90 }, children: [] },
        { type: 'Node2D', name: 'Hidden', props: { position: '(0, 0)', scale: '(2, 2)', visible: false, zIndex: 3 }, children: [] },
      ],
    }])
  })
})
