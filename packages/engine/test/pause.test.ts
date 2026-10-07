import { describe, expect, it } from 'vitest'
import { circle, CollisionShape2D, Node, Node2D, rect, RigidBody2D, Scene, Timer, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

/** 记录 process / physicsProcess 调用次数 */
class Tick extends Node {
  frames = 0
  steps = 0
  override process() {
    this.frames++
  }
  override physicsProcess() {
    this.steps++
  }
}

describe('tree.paused 与 processMode', () => {
  it('暂停时 pausable 节点停止，always 节点继续；子节点继承父节点的模式，可以单独覆盖', async () => {
    const g = await createTestGame({ main: Scene })
    const game = g.scene.add(new Tick({ name: 'Game' }))
    const menu = g.scene.add(new Tick({ name: 'Menu', processMode: 'always' }))
    const menuChild = menu.add(new Tick({ name: 'MenuChild' }))
    const forcedPausable = menu.add(new Tick({ name: 'Forced', processMode: 'pausable' }))
    expect(menuChild.effectiveProcessMode).toBe('always')
    expect(game.effectiveProcessMode).toBe('pausable')

    g.step(3)
    g.tree.paused = true
    g.step(5)
    expect([game.frames, game.steps]).toEqual([3, 3])
    expect([menu.frames, menu.steps]).toEqual([8, 8])
    expect(menuChild.frames).toBe(8)
    expect(forcedPausable.frames).toBe(3)

    g.tree.paused = false
    g.step(2)
    expect(game.frames).toBe(5)
    expect(g.dump()).toContain('Menu (Tick) processMode=always')
  })

  it('暂停时物理世界停止，恢复后继续', async () => {
    const g = await createTestGame({ main: Scene })
    const ball = g.scene.add(new RigidBody2D({ position: v(100, 100) }))
    ball.add(new CollisionShape2D({ shape: circle(10) }))
    g.step(10)
    const y = ball.y
    const vy = ball.linearVelocity.y
    g.tree.paused = true
    g.step(30)
    expect(ball.y).toBe(y)
    g.tree.paused = false
    g.step()
    expect(ball.y).toBeGreaterThan(y)
    expect(ball.linearVelocity.y).toBeGreaterThan(vy)
  })

  it('Timer 和绑定的 Tween 随节点暂停；always 的不受影响', async () => {
    const g = await createTestGame({ main: Scene })
    const t1 = g.scene.add(new Timer({ waitTime: 0.5, autostart: true }))
    const t2 = g.scene.add(new Timer({ waitTime: 0.5, autostart: true, processMode: 'always' }))
    const a = g.scene.add(new Node2D())
    const b = g.scene.add(new Node2D({ processMode: 'always' }))
    a.createTween().to(a, { x: 100 }, 1)
    b.createTween().to(b, { x: 100 }, 1)
    g.tree.paused = true
    g.step(30)
    expect(t1.timeLeft).toBeCloseTo(0.5)
    expect(t2.timeLeft).toBeCloseTo(0.5) // 循环：刚好触发一次后重新开始
    expect(a.x).toBe(0)
    expect(b.x).toBeCloseTo(50)
  })

  it('createTimer 默认暂停时也计时；processAlways: false 时随暂停停止；未绑定的 Tween 随暂停停止', async () => {
    const g = await createTestGame({ main: Scene })
    let always = 0
    let pausable = 0
    g.tree.createTimer(0.25).timeout.connect(() => always++)
    g.tree.createTimer(0.25, { processAlways: false }).timeout.connect(() => pausable++)
    const state = { v: 0 }
    g.tree.createTween().to(state, { v: 1 }, 0.5)
    g.tree.paused = true
    g.step(30)
    expect([always, pausable, state.v]).toEqual([1, 0, 0])
    g.tree.paused = false
    g.step(15)
    expect(pausable).toBe(1)
  })

  it('暂停时可暂停的节点收不到指针事件，always 的（暂停菜单按钮）可以', async () => {
    const g = await createTestGame({ main: Scene })
    const gameButton = g.scene.add(new Node2D({ position: v(100, 100), inputPickable: true, hitArea: rect(-50, -50, 100, 100) }))
    const menuButton = g.scene.add(new Node2D({ position: v(300, 100), inputPickable: true, hitArea: rect(-50, -50, 100, 100), processMode: 'always' }))
    let gameClicks = 0
    let menuClicks = 0
    gameButton.clicked.connect(() => gameClicks++)
    menuButton.clicked.connect(() => menuClicks++)
    g.tree.paused = true
    g.tap(100, 100)
    g.tap(300, 100)
    expect([gameClicks, menuClicks]).toEqual([0, 1])
  })
})

describe('前后台', () => {
  it('切到后台：触发 focusChanged(false)，主循环挂起（step 不推进）；回来后触发 focusChanged(true) 并继续', async () => {
    const g = await createTestGame({ main: Scene })
    const t = g.scene.add(new Tick())
    const events: boolean[] = []
    g.tree.focusChanged.connect((f) => events.push(f))
    g.step(5)
    g.setFocus(false)
    expect(g.game.suspended).toBe(true)
    g.step(100)
    expect(t.frames).toBe(5)
    g.setFocus(true)
    g.step(5)
    expect(t.frames).toBe(10)
    expect(events).toEqual([false, true])
  })

  it('回到前台时清空物理累加器：不会补算切后台前积累的时间', async () => {
    const g = await createTestGame({ main: Scene })
    const t = g.scene.add(new Tick())
    g.game.frame(0.01) // 不足一个物理步，累加器里剩 0.01 秒
    expect(t.steps).toBe(0)
    g.setFocus(false)
    g.setFocus(true)
    g.game.frame(0.01) // 没有清空的话 0.02 秒 > 1/60，会跑一步
    expect(t.steps).toBe(0)
  })

  it('pauseOnBackground: false 时只发信号，游戏继续运行', async () => {
    const g = await createTestGame({ main: Scene, pauseOnBackground: false })
    const t = g.scene.add(new Tick())
    let lost = 0
    g.tree.focusChanged.connect((f) => !f && lost++)
    g.setFocus(false)
    g.step(5)
    expect([lost, t.frames]).toEqual([1, 5])
  })
})
