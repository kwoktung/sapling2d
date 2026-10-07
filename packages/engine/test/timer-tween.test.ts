import { describe, expect, it } from 'vitest'
import { Ease, Node, Node2D, Scene, Timer, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

describe('Timer', () => {
  it('oneShot：到时触发一次后停止', async () => {
    const g = await createTestGame({ main: Scene })
    const t = g.scene.add(new Timer({ waitTime: 0.5, oneShot: true }))
    let fired = 0
    t.timeout.connect(() => fired++)
    t.start()
    g.step(29)
    expect(fired).toBe(0)
    expect(t.timeLeft).toBeCloseTo(1 / 60)
    g.step()
    expect(fired).toBe(1)
    expect(t.isStopped).toBe(true)
    g.step(60)
    expect(fired).toBe(1)
  })

  it('循环：按 waitTime 周期触发，不漂移；stop 后不再触发', async () => {
    const g = await createTestGame({ main: Scene })
    const t = g.scene.add(new Timer({ waitTime: 0.25, autostart: true }))
    const at: number[] = []
    t.timeout.connect(() => at.push(g.tree.processFrames))
    g.stepSeconds(1.1)
    expect(at).toEqual([15, 30, 45, 60])
    t.stop()
    g.stepSeconds(1)
    expect(at).toHaveLength(4)
  })

  it('子类覆写 process() 不影响计时；start(time) 修改时长；dump 显示状态', async () => {
    class Busy extends Timer {
      override process() {}
    }
    const g = await createTestGame({ main: Scene })
    const t = g.scene.add(new Busy({ name: 'Busy' }))
    let fired = 0
    t.timeout.connect(() => fired++)
    t.start(0.1)
    expect(t.waitTime).toBe(0.1)
    g.step(6)
    expect(fired).toBe(1)
    expect(g.dump()).toContain('Busy (Busy) waitTime=0.1 timeLeft=0.1')
  })

  it('tree.createTimer：到时触发 timeout，可以 await', async () => {
    const g = await createTestGame({ main: Scene })
    const timer = g.tree.createTimer(0.5)
    let firedAt = -1
    timer.timeout.connect(() => (firedAt = g.tree.processFrames))
    const done = timer.timeout.wait()
    g.step(40)
    expect(firedAt).toBe(30)
    await done
  })
})

describe('Tween', () => {
  it('线性补间数值和 Vector2；从下一帧开始；结束时触发 finished', async () => {
    const g = await createTestGame({ main: Scene })
    const n = g.scene.add(new Node2D({ position: v(0, 0) }))
    const tween = n.createTween().to(n, { x: 100, scale: v(3, 3) }, 1)
    let finished = 0
    tween.finished.connect(() => finished++)
    g.step() // 创建后的第一帧：已推进 1/60 秒
    expect(n.x).toBeCloseTo(100 / 60)
    g.step(29)
    expect(n.x).toBeCloseTo(50)
    expect(n.scale.isEqualApprox(v(2, 2))).toBe(true)
    g.step(30)
    expect(n.x).toBe(100)
    expect(finished).toBe(1)
    expect(tween.isRunning).toBe(false)
  })

  it('默认按顺序执行；parallel() 与前一个同时进行；wait 和 call', async () => {
    const g = await createTestGame({ main: Scene })
    const a = g.scene.add(new Node2D())
    const b = g.scene.add(new Node2D())
    const log: number[] = []
    a.createTween()
      .to(a, { x: 60 }, 0.5)
      .parallel()
      .to(b, { x: 30 }, 0.25)
      .wait(0.5)
      .call(() => log.push(g.tree.processFrames))
      .to(a, { y: 10 }, 0.5)
    g.step(15)
    expect(a.x).toBeCloseTo(30)
    expect(b.x).toBe(30) // 0.25 秒就到了
    g.step(15)
    expect(a.x).toBe(60)
    expect(a.y).toBe(0)
    g.step(30) // wait 0.5
    expect(log).toEqual([60])
    g.step(30)
    expect(a.y).toBe(10)
  })

  it('起始值在这一步开始时读取（而不是创建 tween 时）', async () => {
    const g = await createTestGame({ main: Scene })
    const n = g.scene.add(new Node2D())
    n.createTween().wait(0.5).to(n, { x: 100 }, 0.5)
    g.step(15)
    n.x = 50 // 在第二步开始前修改
    g.step(15 + 15)
    expect(n.x).toBeCloseTo(75)
  })

  it('缓动曲线生效', async () => {
    const g = await createTestGame({ main: Scene })
    const n = g.scene.add(new Node2D())
    n.createTween().to(n, { x: 100 }, 1, Ease.QuadIn)
    g.step(30)
    expect(n.x).toBeCloseTo(25)
    expect(Ease.BackOut(0.5)).toBeGreaterThan(1)
    for (const f of Object.values(Ease)) {
      expect(f(0)).toBeCloseTo(0)
      expect(f(1)).toBeCloseTo(1)
    }
  })

  it('绑定节点被销毁时自动停止，不触发 finished；也可以手动 kill', async () => {
    const g = await createTestGame({ main: Scene })
    const n = g.scene.add(new Node2D())
    const t = n.createTween().to(n, { x: 100 }, 1)
    let finished = 0
    t.finished.connect(() => finished++)
    g.step(10)
    n.queueFree()
    g.step(60)
    expect(t.isRunning).toBe(false)
    expect(finished).toBe(0)

    const m = g.scene.add(new Node2D())
    const t2 = g.tree.createTween().to(m, { x: 100 }, 1)
    g.step(30)
    t2.kill()
    g.step(30)
    expect(m.x).toBeCloseTo(50)
  })

  it('finished 可以 await；补间普通对象的数值属性', async () => {
    const g = await createTestGame({ main: Scene })
    const state = { volume: 0, label: 'x' }
    const tween = g.tree.createTween().to(state, { volume: 1 }, 0.5)
    const done = tween.finished.wait()
    g.step(30)
    await done
    expect(state.volume).toBe(1)
  })

  it('只能补间 number / Vector2 属性（类型检查）', async () => {
    const g = await createTestGame({ main: Scene })
    const n = g.scene.add(new Node2D())
    // @ts-expect-error name 是 string，不能补间
    n.createTween().to(n, { name: 'x' }, 1)
    // @ts-expect-error position 是 Vector2，不能给 number
    n.createTween().to(n, { position: 3 }, 1)
  })

  it('合成动效的典型写法：弹一下再销毁', async () => {
    class Fruit extends Node2D {
      pop() {
        this.createTween()
          .to(this, { scale: v(1.3, 1.3) }, 0.1, Ease.BackOut)
          .to(this, { scale: v(0, 0) }, 0.1)
          .call(() => this.queueFree())
      }
    }
    const g = await createTestGame({ main: Scene })
    const f = g.scene.add(new Fruit())
    f.pop()
    g.step(6)
    expect(f.scale.x).toBeGreaterThan(1.2)
    g.step(7)
    expect(f.isFreed).toBe(true)
    expect(g.scene.children).toHaveLength(0)
  })

  it('无头模式下结果确定：两次运行完全一致', async () => {
    const run = async () => {
      const g = await createTestGame({ main: Scene })
      const nodes = Array.from({ length: 5 }, (_, i) => g.scene.add(new Node2D({ name: `N${i}` })))
      nodes.forEach((n, i) => n.createTween().to(n, { x: 100 * i, rotation: i }, 0.3 + i * 0.1, Ease.ElasticOut))
      g.step(20)
      return g.dump()
    }
    expect(await run()).toBe(await run())
  })
})

describe('Node.createTween', () => {
  it('不在树里的节点不能创建 tween（明确报错）', () => {
    expect(() => new Node().createTween()).toThrow(/not inside the scene tree/)
  })
})
