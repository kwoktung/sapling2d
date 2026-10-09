import type { Container, Particle, ParticleContainer } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { Node2D, Particles2D, Scene, tex, v, type Particles2DOptions } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { PixiRenderer } from '../src/render/PixiRenderer'

async function setup(seed = 1) {
  const g = await createTestGame({ main: Scene, seed })
  return { g, scene: g.scene }
}

/** 存活粒子的位置。 */
function positions(p: Particles2D) {
  const out: [number, number][] = []
  for (let i = 0; i < p.aliveCount; i++) out.push([p._px[i]!, p._py[i]!])
  return out
}

const burst = (o: Particles2DOptions = {}) => new Particles2D({ emitting: false, amount: 8, lifetime: 1, ...o })

describe('Particles2D', () => {
  it('默认值；amount 必须是非负整数', () => {
    const p = new Particles2D()
    expect([p.amount, p.lifetime, p.emitting, p.oneShot, p.spread, p.speedMin, p.speedMax, p.localCoords]).toEqual([16, 1, true, false, Math.PI, 100, 100, false])
    expect(() => (p.amount = -1)).toThrow(/amount/)
    expect(() => (p.amount = 1.5)).toThrow(/amount/)
  })

  it('emit()：在节点的全局位置发射；方向和速度；不超过上限', async () => {
    const { g, scene } = await setup()
    const parent = scene.add(new Node2D({ position: v(100, 200) }))
    const p = parent.add(burst({ position: v(10, 20), spread: 0, speedMin: 300 }))
    p.emit()
    expect(p.aliveCount).toBe(8)
    expect(positions(p).every(([x, y]) => x === 110 && y === 220)).toBe(true)
    p.emit(5) // 已经满了
    expect(p.aliveCount).toBe(8)
    g.stepSeconds(0.5)
    // 方向 0（向右）、速度 300：半秒走 150
    for (const [x, y] of positions(p)) {
      expect(x).toBeCloseTo(260, 0)
      expect(y).toBeCloseTo(220)
    }
  })

  it('spread 和速度范围：在范围内随机', async () => {
    const { g, scene } = await setup()
    const p = scene.add(burst({ amount: 200, direction: -Math.PI / 2, spread: Math.PI / 6, speedMin: 100, speedMax: 200 }))
    p.emit()
    g.step()
    const dt = 1 / 60
    for (const [x, y] of positions(p)) {
      const angle = Math.atan2(y, x)
      const speed = Math.hypot(x, y) / dt
      expect(Math.abs(angle + Math.PI / 2)).toBeLessThanOrEqual(Math.PI / 6 + 1e-9)
      expect(speed).toBeGreaterThanOrEqual(100 - 1e-6)
      expect(speed).toBeLessThanOrEqual(200 + 1e-6)
    }
  })

  it('寿命到了就消失；全部消失时发出 finished（一次）', async () => {
    const { g, scene } = await setup()
    const p = scene.add(burst({ lifetime: 0.5 }))
    let finished = 0
    p.finished.connect(() => finished++)
    p.emit()
    g.stepSeconds(0.45)
    expect([p.aliveCount, finished]).toEqual([8, 0])
    g.stepSeconds(0.1)
    expect([p.aliveCount, finished]).toEqual([0, 1])
    g.stepSeconds(1)
    expect(finished).toBe(1)
  })

  it('lifetimeRandomness：寿命在 lifetime × (1 - r) 到 lifetime 之间', async () => {
    const { scene } = await setup()
    const p = scene.add(burst({ amount: 100, lifetime: 1, lifetimeRandomness: 0.5 }))
    p.emit()
    const lives = Array.from(p._life.subarray(0, p.aliveCount))
    expect(Math.min(...lives)).toBeGreaterThanOrEqual(0.5)
    expect(Math.max(...lives)).toBeLessThanOrEqual(1)
    expect(Math.max(...lives) - Math.min(...lives)).toBeGreaterThan(0.3)
  })

  it('持续发射：默认每秒 amount / lifetime 个，维持满员；停止后剩下的消失，发出 finished', async () => {
    const { g, scene } = await setup()
    const p = scene.add(new Particles2D({ amount: 30, lifetime: 0.5 }))
    let finished = 0
    p.finished.connect(() => finished++)
    g.stepSeconds(0.25)
    expect(p.aliveCount).toBeGreaterThanOrEqual(14)
    expect(p.aliveCount).toBeLessThanOrEqual(16)
    g.stepSeconds(1)
    expect(p.aliveCount).toBeGreaterThanOrEqual(29)
    expect(p.aliveCount).toBeLessThanOrEqual(30)
    p.emitting = false
    g.stepSeconds(0.6)
    expect([p.aliveCount, finished]).toEqual([0, 1])
  })

  it('rate 可以自定义；达到上限时不再发射', async () => {
    const { g, scene } = await setup()
    const p = scene.add(new Particles2D({ amount: 5, lifetime: 10, rate: 60 }))
    g.stepSeconds(0.5)
    expect(p.aliveCount).toBe(5)
  })

  it('oneShot：emitting 为 true 时一次发射 amount 个，然后 emitting 变回 false', async () => {
    const { g, scene } = await setup()
    const p = scene.add(new Particles2D({ amount: 12, oneShot: true, lifetime: 0.3 }))
    let finished = 0
    p.finished.connect(() => finished++)
    g.step()
    expect([p.aliveCount, p.emitting]).toEqual([12, false])
    g.stepSeconds(0.4)
    expect([p.aliveCount, finished]).toEqual([0, 1])
    p.emitting = true // 再来一轮
    g.step()
    expect(p.aliveCount).toBe(12)
  })

  it('重力和阻尼', async () => {
    const { g, scene } = await setup()
    const fall = scene.add(burst({ amount: 1, speedMin: 0, gravity: v(0, 600) }))
    const slow = scene.add(burst({ amount: 1, spread: 0, speedMin: 600, damping: 6 }))
    fall.emit()
    slow.emit()
    g.stepSeconds(0.5)
    // y = ½·g·t² ≈ 75（离散积分，略大一点）
    expect(fall._py[0]).toBeGreaterThan(70)
    expect(fall._py[0]).toBeLessThan(85)
    // 不减速时会走 300，阻尼 6 时大约走 100
    expect(slow._px[0]).toBeGreaterThan(80)
    expect(slow._px[0]).toBeLessThan(110)
  })

  it('全局坐标：发射后节点移动，粒子留在原地；方向跟着节点的全局旋转', async () => {
    const { g, scene } = await setup()
    const holder = scene.add(new Node2D({ position: v(300, 300), rotation: Math.PI / 2 }))
    const p = holder.add(burst({ amount: 1, spread: 0, speedMin: 100, lifetime: 2 }))
    p.emit()
    holder.position = v(600, 900)
    g.stepSeconds(1)
    // 方向 0 被父节点转了 90°：向下
    expect(p._px[0]).toBeCloseTo(300)
    expect(p._py[0]).toBeCloseTo(400, 0)
  })

  it('localCoords：粒子用节点的局部坐标，跟着节点走', async () => {
    const { g, scene } = await setup()
    const p = scene.add(burst({ amount: 1, spread: 0, speedMin: 100, lifetime: 2, localCoords: true, position: v(300, 300) }))
    p.emit()
    p.position = v(600, 900)
    g.stepSeconds(1)
    expect(p._px[0]).toBeCloseTo(100, 0)
    expect(p._py[0]).toBeCloseTo(0)
  })

  it('受 timeScale 和暂停影响；同一个 seed 结果一样', async () => {
    const run = async (seed: number) => {
      const { g, scene } = await setup(seed)
      const p = scene.add(burst({ amount: 20, speedMin: 50, speedMax: 150 }))
      p.emit()
      g.tree.timeScale = 0
      g.stepSeconds(1)
      const frozen = positions(p)
      g.tree.timeScale = 1
      g.tree.paused = true
      g.stepSeconds(1)
      expect(positions(p)).toEqual(frozen)
      expect(frozen.every(([x, y]) => x === 0 && y === 0)).toBe(true)
      g.tree.paused = false
      g.stepSeconds(0.5)
      return positions(p)
    }
    expect(await run(7)).toEqual(await run(7))
    expect(await run(7)).not.toEqual(await run(8))
  })

  it('dump 显示存活粒子数', async () => {
    const { scene, g } = await setup()
    const p = scene.add(burst({ name: 'Sparks', texture: tex('spark.png') }))
    p.emit(3)
    expect(g.dump()).toContain('Sparks (Particles2D) position=(0, 0) texture=spark.png particles=3')
  })

  it('不在树里时 emit() 什么也不做', () => {
    const p = burst()
    p.emit()
    expect(p.aliveCount).toBe(0)
  })
})

describe('Particles2D 渲染', () => {
  async function render() {
    const { g, scene } = await setup()
    const r = PixiRenderer._createForSyncTests()
    return { g, scene, sync: () => r.sync(g.tree) }
  }
  const pcOf = (p: Particles2D) => (p.unsafePixi as Container).children[0] as ParticleContainer

  it('一个 ParticleContainer；粒子数、位置、缩放和透明度随寿命插值', async () => {
    const { g, scene, sync } = await render()
    const p = scene.add(burst({ texture: tex('spark.png'), amount: 4, spread: 0, speedMin: 60, lifetime: 1, scaleStart: 2, scaleEnd: 0, alphaStart: 1, alphaEnd: 0 }))
    p.emit()
    g.stepSeconds(0.5)
    sync()
    const pc = pcOf(p)
    expect(pc.particleChildren).toHaveLength(4)
    const q = pc.particleChildren[0] as Particle
    expect(q.x).toBeCloseTo(p._px[0]!)
    expect(q.scaleX).toBeCloseTo(1, 1)
    expect(q.alpha).toBeCloseTo(0.5, 1)
    g.stepSeconds(0.6)
    sync()
    expect(pc.particleChildren).toHaveLength(0)
    p.emit(2)
    sync()
    expect(pc.particleChildren).toHaveLength(2)
    expect(pc.particleChildren[0]).toBe(q) // 粒子对象复用，不重新创建
  })

  it('全局坐标：内容层的变换是节点全局变换的逆（节点怎么动，粒子都画在原处）', async () => {
    const { scene, sync } = await render()
    const holder = scene.add(new Node2D({ position: v(200, 100), rotation: 0.7, scale: v(2, 1.5) }))
    const p = holder.add(burst({ texture: tex('spark.png'), position: v(30, -10) }))
    p.emit()
    sync()
    const pc = pcOf(p)
    pc.updateLocalTransform()
    const m = pc.localTransform
    p._computeGlobal()
    // 节点全局变换 × 内容层变换 = 单位矩阵
    const a = p._ga * m.a + p._gc * m.b
    const b = p._gb * m.a + p._gd * m.b
    const c = p._ga * m.c + p._gc * m.d
    const d = p._gb * m.c + p._gd * m.d
    const tx = p._ga * m.tx + p._gc * m.ty + p._gtx
    const ty = p._gb * m.tx + p._gd * m.ty + p._gty
    for (const [got, want] of [[a, 1], [b, 0], [c, 0], [d, 1], [tx, 0], [ty, 0]] as const) expect(got).toBeCloseTo(want)
  })

  it('没有贴图时不画（照样模拟）；隐藏时不同步', async () => {
    const { g, scene, sync } = await render()
    const p = scene.add(burst())
    p.emit()
    sync()
    expect(pcOf(p).particleChildren).toHaveLength(0)
    expect(p.aliveCount).toBe(8)
    p.texture = tex('spark.png')
    p.visible = false
    sync()
    expect(pcOf(p).particleChildren).toHaveLength(0)
    p.visible = true
    g.step()
    sync()
    expect(pcOf(p).particleChildren).toHaveLength(8)
  })
})
