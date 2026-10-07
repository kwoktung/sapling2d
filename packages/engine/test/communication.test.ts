import { describe, expect, expectTypeOf, it } from 'vitest'
import { Node, Node2D, Scene, Signal, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

class Fruit extends Node2D {
  level = 1
}

// 用声明合并注册组名：之后组名有自动补全和类型检查，getNodesInGroup 返回对应类型
declare module 'sapling2d' {
  interface GroupRegistry {
    fruits: Fruit
    enemies: Node2D
  }
}

describe('Signal', () => {
  it('connect / emit / disconnect，带类型的参数', () => {
    const scored = new Signal<[points: number, combo: boolean]>()
    const got: [number, boolean][] = []
    const listener = (p: number, c: boolean) => got.push([p, c])
    scored.connect(listener)
    scored.connect(listener) // 重复连接只算一次
    scored.emit(10, true)
    expect(got).toEqual([[10, true]])
    expect(scored.connectionCount).toBe(1)

    scored.disconnect(listener)
    scored.emit(5, false)
    expect(got).toHaveLength(1)
  })

  it('once 只触发一次；connect 返回断开函数', () => {
    const s = new Signal()
    let onceCount = 0
    let count = 0
    s.once(() => onceCount++)
    const off = s.connect(() => count++)
    s.emit()
    s.emit()
    off()
    s.emit()
    expect(onceCount).toBe(1)
    expect(count).toBe(2)
  })

  it('emit 过程中断开的监听不会再被调用', () => {
    const s = new Signal()
    const calls: string[] = []
    const b = () => calls.push('b')
    s.connect(() => {
      calls.push('a')
      s.disconnect(b)
    })
    s.connect(b)
    s.emit()
    expect(calls).toEqual(['a'])
  })

  it('可以直接 await：无参数得到 undefined，一个参数得到该值，多个参数得到数组', async () => {
    const none = new Signal()
    const one = new Signal<[score: number]>()
    const two = new Signal<[x: number, y: number]>()
    // 像游戏里一样，在之后的“帧”里 emit
    setTimeout(() => {
      none.emit()
      one.emit(42)
      two.emit(3, 4)
    }, 0)
    const [r0, r1, r2] = await Promise.all([(async () => await none)(), (async () => await one)(), (async () => await two)()])
    expect(r0).toBeUndefined()
    expect(r1).toBe(42)
    expect(r2).toEqual([3, 4])
    expectTypeOf(one.wait()).resolves.toEqualTypeOf<number>()
    expectTypeOf(two.wait()).resolves.toEqualTypeOf<[x: number, y: number]>()
  })

  it('wait() 立即注册监听：同步紧接着的 emit 也能拿到', async () => {
    const s = new Signal<[n: number]>()
    const p = s.wait()
    s.emit(7)
    expect(await p).toBe(7)
  })
})

describe('queueFree / callDeferred', () => {
  class Enemy extends Node2D {
    readonly died = new Signal<[score: number]>()
    exited = false
    override exitTree() {
      this.exited = true
    }
  }

  it('queueFree 在帧末执行：本帧仍在树里，帧末收到 exitTree 并被移除，子节点一起销毁', async () => {
    const g = await createTestGame({ main: Scene })
    const enemy = g.scene.add(new Enemy())
    const child = enemy.add(new Node2D({ name: 'Eye' }))
    enemy.queueFree()
    enemy.queueFree() // 重复调用安全
    expect(enemy.isQueuedForDeletion).toBe(true)
    expect(enemy.isInsideTree).toBe(true)

    g.step()
    expect(enemy.exited).toBe(true)
    expect(enemy.isFreed).toBe(true)
    expect(child.isFreed).toBe(true)
    expect(g.scene.children).toHaveLength(0)
    expect(() => g.scene.add(enemy)).toThrow(/has been freed/)
  })

  it('销毁后自动断开：节点声明的信号上的监听，以及节点作为 owner 的连接', async () => {
    const g = await createTestGame({ main: Scene })
    const enemy = g.scene.add(new Enemy())
    const hud = g.scene.add(new Node2D({ name: 'Hud' }))
    const bus = new Signal<[msg: string]>()
    const heard: string[] = []
    bus.connect((m) => heard.push(m), hud) // hud 是 owner
    enemy.died.connect(() => heard.push('died'))

    hud.queueFree()
    enemy.queueFree()
    g.step()
    bus.emit('hello')
    enemy.died.emit(1)
    expect(heard).toEqual([])
    expect(bus.connectionCount).toBe(0)
    expect(enemy.died.connectionCount).toBe(0)
  })

  it('在信号回调里 queueFree 两个节点再生成新节点（合成玩法的典型写法）', async () => {
    const g = await createTestGame({ main: Scene })
    const a = g.scene.add(new Fruit({ name: 'A' }))
    const b = g.scene.add(new Fruit({ name: 'B' }))
    const touched = new Signal<[other: Fruit]>()
    touched.connect((other) => {
      a.queueFree()
      other.queueFree()
      a.callDeferred(() => {
        g.scene.add(new Fruit({ name: 'Merged', position: v(50, 50) }))
      })
    }, a)
    touched.emit(b)
    g.step()
    expect(g.scene.children.map((c) => c.name)).toEqual(['Merged'])
  })

  it('callDeferred 在所有 process 之后、销毁之前执行；节点已销毁时不执行', async () => {
    const order: string[] = []
    class Worker extends Node {
      override process() {
        order.push(`process:${this.name}`)
      }
    }
    const g = await createTestGame({ main: Scene })
    const w1 = g.scene.add(new Worker({ name: 'w1' }))
    g.scene.add(new Worker({ name: 'w2' }))
    g.tree.callDeferred(() => order.push('deferred'))
    w1.callDeferred(() => order.push('never')) // w1 在执行前被立即销毁
    w1._free()
    g.step()
    expect(order).toEqual(['process:w2', 'deferred'])
  })

  it('不在树里的节点 queueFree 会立即销毁', () => {
    const n = new Node()
    n.queueFree()
    expect(n.isFreed).toBe(true)
  })
})

describe('Groups', () => {
  it('getNodesInGroup 按树的先序返回，并带注册过的类型；dump 显示分组', async () => {
    const g = await createTestGame({ main: Scene })
    const f1 = g.scene.add(new Fruit({ name: 'F1' }))
    f1.addToGroup('fruits')
    const box = g.scene.add(new Node2D({ name: 'Box' }))
    const f2 = box.add(new Fruit({ name: 'F2', groups: ['fruits'] }))
    g.scene.add(new Node2D({ name: 'Bat', groups: ['enemies'] }))

    const fruits = g.tree.getNodesInGroup('fruits')
    expectTypeOf(fruits).toEqualTypeOf<Fruit[]>()
    expect(fruits).toEqual([f1, f2])
    expect(fruits.map((f) => f.level)).toEqual([1, 1])
    expect(g.tree.getFirstNodeInGroup('enemies')?.name).toBe('Bat')
    expect(g.dump()).toContain('F2 (Fruit) position=(0, 0) groups=[fruits]')

    f1.removeFromGroup('fruits')
    expect(f1.isInGroup('fruits')).toBe(false)
    expect(g.tree.getNodesInGroup('fruits')).toEqual([f2])
  })

  it('不在树里或已销毁的节点不会被查到', async () => {
    const g = await createTestGame({ main: Scene })
    const detached = new Fruit({ groups: ['fruits'] })
    const doomed = g.scene.add(new Fruit({ groups: ['fruits'] }))
    doomed.queueFree()
    g.step()
    expect(detached.isInGroup('fruits')).toBe(true)
    expect(g.tree.getNodesInGroup('fruits')).toEqual([])
  })

  it('未注册的组名是类型错误', () => {
    const n = new Node()
    // @ts-expect-error 'bullets' 没有在 GroupRegistry 中注册
    n.addToGroup('bullets')
  })
})

describe('Autoload', () => {
  class GameState extends Node {
    score = 0
    processed = 0
    override process() {
      this.processed++
    }
  }
  class Hud extends Scene {
    override ready() {
      this.tree.autoload(GameState).score += 10
    }
  }

  it('按类型取得单例；在场景之前创建并处理；切换场景后仍保留', async () => {
    const g = await createTestGame({ main: Hud, autoloads: [GameState] })
    const state = g.tree.autoload(GameState)
    expectTypeOf(state).toEqualTypeOf<GameState>()
    expect(state.score).toBe(10)
    expect(g.dump().split('\n')[0]).toBe('GameState (GameState)')

    g.step(3)
    expect(state.processed).toBe(3)

    g.tree._setScene(new Hud())
    expect(g.tree.autoload(GameState)).toBe(state)
    expect(state.score).toBe(20)
  })

  it('未注册的 Autoload 给出明确报错', async () => {
    const g = await createTestGame({ main: Scene })
    expect(() => g.tree.autoload(GameState)).toThrow(/autoloads: \[GameState\]/)
  })
})
