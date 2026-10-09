import { describe, expect, it } from 'vitest'
import { AnimatedSprite2D, circle, CollisionShape2D, key, Node, Node2D, RigidBody2D, Scene, sheet, Timer, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

declare module 'sapling2d' {
  interface ActionRegistry {
    tsJump: true
  }
}

/** 记录 process 收到的 dt、physicsProcess 的次数和 just pressed。 */
class Probe extends Node {
  processTime = 0
  physicsSteps = 0
  justInProcess = 0
  justInPhysics = 0
  override process(dt: number) {
    this.processTime += dt
    if (this.tree.input.isActionJustPressed('tsJump')) this.justInProcess++
  }
  override physicsProcess() {
    this.physicsSteps++
    if (this.tree.input.isActionJustPressed('tsJump')) this.justInPhysics++
  }
}

class Main extends Scene {
  probe!: Probe
  marker!: Node2D
  timer!: Timer
  timeouts = 0
  override ready() {
    this.probe = this.add(new Probe())
    this.marker = this.add(new Node2D())
    this.timer = this.add(new Timer({ waitTime: 1, autostart: true }))
    this.timer.timeout.connect(() => this.timeouts++)
  }
}

async function setup() {
  const g = await createTestGame({ main: Main, actions: { tsJump: [key('Space')] } })
  return { g, scene: g.scene as Main }
}

describe('tree.timeScale', () => {
  it('默认 1；不能是负数、NaN、无穷大', async () => {
    const { g } = await setup()
    expect(g.tree.timeScale).toBe(1)
    for (const bad of [-0.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => (g.tree.timeScale = bad)).toThrow(/timeScale/)
    g.tree.timeScale = 0
    expect(g.tree.timeScale).toBe(0)
  })

  it('0.5：process 的 dt、物理步数、time、Tween、Timer 都慢一半', async () => {
    const { g, scene } = await setup()
    g.tree.timeScale = 0.5
    const t0 = g.tree.time
    scene.marker.createTween().to(scene.marker, { x: 100 }, 1)
    g.step(120) // 真实 2 秒
    expect(scene.probe.processTime).toBeCloseTo(1)
    expect(scene.probe.physicsSteps).toBe(60)
    expect(g.tree.time - t0).toBeCloseTo(1)
    expect(scene.marker.x).toBeCloseTo(100) // 1 秒的补间在真实 2 秒后完成
    expect(scene.timeouts).toBe(1) // 每 1 秒（游戏时间）一次
    g.step(59)
    expect(scene.marker.x).toBeCloseTo(100)
    expect(scene.timeouts).toBe(1)
  })

  it('2：每帧两个物理步，时间快一倍', async () => {
    const { g, scene } = await setup()
    g.tree.timeScale = 2
    g.step(30)
    expect(scene.probe.physicsSteps).toBe(60)
    expect(scene.timeouts).toBe(1)
  })

  it('0：游戏时间完全停止（物理、刚体、Tween、Timer、createTimer、帧动画、time）', async () => {
    const { g, scene } = await setup()
    const ball = scene.add(new RigidBody2D({ position: v(375, 100) }))
    ball.add(new CollisionShape2D({ shape: circle(10) }))
    const anim = scene.add(new AnimatedSprite2D({ frames: sheet('ts-anim.png', { columns: 4, rows: 1 }).frames(), fps: 10, autoplay: true }))
    let fired = 0
    g.tree.createTimer(0.5).timeout.connect(() => fired++)
    scene.marker.createTween().to(scene.marker, { x: 100 }, 1)
    g.step(10)
    const before = { y: ball.y, x: scene.marker.x, frame: anim.frame, time: g.tree.time, steps: scene.probe.physicsSteps, left: scene.timer.timeLeft }
    expect([before.frame, before.x, before.steps]).not.toContain(0) // 停顿前都在走
    g.tree.timeScale = 0
    g.step(120)
    expect({ y: ball.y, x: scene.marker.x, frame: anim.frame, time: g.tree.time, steps: scene.probe.physicsSteps, left: scene.timer.timeLeft }).toEqual(before)
    expect(fired).toBe(0)
    g.tree.timeScale = 1
    g.step(30)
    expect(ball.y).toBeGreaterThan(before.y)
    expect(fired).toBe(1)
  })

  it('停顿时输入照常处理：process 里当帧看到，恢复后的第一个物理步里也看到（不丢按键）', async () => {
    const { g, scene } = await setup()
    g.tree.timeScale = 0
    g.pressKey('Space')
    g.step(5)
    expect([scene.probe.justInProcess, scene.probe.justInPhysics]).toEqual([1, 0])
    g.tree.timeScale = 1
    g.step(3)
    expect(scene.probe.justInPhysics).toBe(1)
  })

  it('打击停顿：createTimer 的 ignoreTimeScale 按真实时间计时，用它恢复', async () => {
    const { g, scene } = await setup()
    const hitStop = async (seconds: number) => {
      g.tree.timeScale = 0
      await g.tree.createTimer(seconds, { ignoreTimeScale: true }).timeout
      g.tree.timeScale = 1
    }
    const settle = () => new Promise((r) => setTimeout(r, 0)) // 让 await 之后的代码跑完
    void hitStop(0.1)
    g.step(5)
    await settle()
    expect(g.tree.timeScale).toBe(0)
    g.step(1) // 0.1 秒 = 6 帧真实时间
    await settle()
    expect(g.tree.timeScale).toBe(1)
    const steps = scene.probe.physicsSteps
    g.step(6)
    expect(scene.probe.physicsSteps).toBe(steps + 6)
  })

  it('和 paused 互相独立', async () => {
    const { g, scene } = await setup()
    g.tree.timeScale = 0.5
    g.tree.paused = true
    g.step(60)
    expect(scene.probe.processTime).toBe(0) // 暂停：pausable 节点不处理
    g.tree.paused = false
    expect(g.tree.timeScale).toBe(0.5)
    g.step(60)
    expect(scene.probe.processTime).toBeCloseTo(0.5)
  })
})
