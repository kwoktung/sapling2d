import { describe, expect, it } from 'vitest'
import { key, Node, Node2D, pointerPress, rect, Scene, Sprite2D, tex, v, type PointerEvent2D } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

declare module 'sapling2d' {
  interface ActionRegistry {
    drop: true
    jump: true
  }
}

/** 一个 100×100、以原点为中心的可点击方块，记录收到的事件。 */
class Button extends Node2D {
  log: string[] = []
  constructor(opts: ConstructorParameters<typeof Node2D>[0] = {}) {
    super({ inputPickable: true, hitArea: rect(-50, -50, 100, 100), ...opts })
  }
  override ready() {
    const fmt = (e: PointerEvent2D) => `${e.position}@${e.localPosition}`
    this.pointerDown.connect((e) => this.log.push(`down ${fmt(e)}`))
    this.pointerMove.connect((e) => this.log.push(`move ${fmt(e)}`))
    this.pointerUp.connect((e) => this.log.push(`up ${fmt(e)}`))
    this.clicked.connect((e) => this.log.push(`click ${fmt(e)}`))
  }
}

describe('指针与命中测试', () => {
  it('点中可点击节点：依次收到 down、up、clicked，带全局和局部坐标', async () => {
    const g = await createTestGame({ main: Scene })
    const b = g.scene.add(new Button({ position: v(200, 300) }))
    g.tap(210, 290)
    expect(b.log).toEqual(['down (210, 290)@(10, -10)', 'up (210, 290)@(10, -10)', 'click (210, 290)@(10, -10)'])
  })

  it('点在区域外、不可点击或不可见（含祖先不可见）的节点收不到事件', async () => {
    const g = await createTestGame({ main: Scene })
    const outside = g.scene.add(new Button({ position: v(500, 500) }))
    const notPickable = g.scene.add(new Button({ position: v(100, 100), inputPickable: false }))
    const hidden = g.scene.add(new Button({ position: v(100, 100), visible: false }))
    const parent = g.scene.add(new Node2D({ visible: false }))
    const hiddenByParent = parent.add(new Button({ position: v(100, 100) }))
    g.tap(100, 100)
    for (const b of [outside, notPickable, hidden, hiddenByParent]) expect(b.log).toEqual([])
  })

  it('重叠时只有最上层收到：后添加的在上；zIndex 更大的在上', async () => {
    const g = await createTestGame({ main: Scene })
    const a = g.scene.add(new Button({ name: 'A', position: v(100, 100) }))
    const b = g.scene.add(new Button({ name: 'B', position: v(120, 100) }))
    g.tap(110, 100)
    expect([a.log.length, b.log.length]).toEqual([0, 3])

    a.zIndex = 1
    g.tap(110, 100)
    expect([a.log.length, b.log.length]).toEqual([3, 3])
  })

  it('子节点画在父节点之上，可以挡住父节点', async () => {
    const g = await createTestGame({ main: Scene })
    const parent = g.scene.add(new Button({ name: 'Parent', position: v(100, 100) }))
    const child = parent.add(new Button({ name: 'Child' }))
    g.tap(100, 100)
    expect([parent.log.length, child.log.length]).toEqual([0, 3])
  })

  it('考虑父节点的旋转和缩放', async () => {
    const g = await createTestGame({ main: Scene })
    const parent = g.scene.add(new Node2D({ position: v(300, 300), rotation: Math.PI / 2, scale: v(2, 2) }))
    // 局部 (50, 0)：缩放 2 倍、旋转 90° 后在全局 (300, 400)
    const b = parent.add(new Button({ position: v(50, 0), hitArea: rect(-10, -10, 20, 20) }))
    expect(b.globalPosition.isEqualApprox(v(300, 400))).toBe(true)
    g.tap(300, 400)
    expect(b.log[0]).toBe('down (300, 400)@(0, 0)')
    g.tap(300, 450) // 局部约 (25, 0)，超出 20×20 区域
    expect(b.log).toHaveLength(3)
  })

  it('圆形点击区域；Sprite2D 默认用贴图范围', async () => {
    const g = await createTestGame({ main: Scene })
    const circle = g.scene.add(new Button({ position: v(100, 100), hitArea: { radius: 30 } }))
    g.tap(125, 100)
    g.tap(125, 125) // 距离约 35.4，在圆外
    expect(circle.log.filter((l) => l.startsWith('click'))).toHaveLength(1)

    const t = tex('input-test-sprite.png')
    t._setLoaded(null, 100, 40) // 无头模式下手动给贴图尺寸
    const sprite = g.scene.add(new Sprite2D({ texture: t, position: v(400, 400), inputPickable: true }))
    let clicks = 0
    sprite.clicked.connect(() => clicks++)
    g.tap(440, 410) // 在 100×40 内
    g.tap(400, 430) // 超出高度
    expect(clicks).toBe(1)
  })

  it('拖拽：按下后的移动和抬起都发给该节点，即使移出区域；在区域外抬起不触发 clicked', async () => {
    const g = await createTestGame({ main: Scene })
    const b = g.scene.add(new Button({ position: v(100, 100) }))
    g.drag(v(100, 100), v(400, 100), { frames: 3 })
    expect(b.log).toEqual(['down (100, 100)@(0, 0)', 'move (200, 100)@(100, 0)', 'move (300, 100)@(200, 0)', 'move (400, 100)@(300, 0)', 'up (400, 100)@(300, 0)'])
  })

  it('多点触控：每个指针各自捕获', async () => {
    const g = await createTestGame({ main: Scene })
    const left = g.scene.add(new Button({ name: 'L', position: v(100, 100) }))
    const right = g.scene.add(new Button({ name: 'R', position: v(500, 100) }))
    g.pointerDown(100, 100, 1)
    g.pointerDown(500, 100, 2)
    g.step()
    expect(g.tree.input.pressedPointers.size).toBe(2)
    g.pointerUp(500, 100, 2)
    g.pointerUp(100, 100, 1)
    g.step()
    expect(left.log.map((l) => l.split(' ')[0])).toEqual(['down', 'up', 'click'])
    expect(right.log.map((l) => l.split(' ')[0])).toEqual(['down', 'up', 'click'])
  })

  it('屏幕与设计分辨率不同时，坐标换算到设计坐标', async () => {
    const g = await createTestGame({ main: Scene, screen: { width: 402, height: 874, pixelRatio: 3 } })
    const b = g.scene.add(new Button({ position: v(375, 667) }))
    g.tap(375, 667)
    expect(b.log[0]).toBe('down (375, 667)@(0, 0)')
    // 直接注入窗口坐标：屏幕中心 (201, 437) 就是设计坐标 (375, 667)
    g.platform.injectInput({ type: 'pointerdown', pointerId: 7, x: 201, y: 437 })
    g.step()
    expect(g.tree.input.pointerPosition?.isEqualApprox(v(375, 667))).toBe(true)
  })

  it('节点在按住期间被销毁：后续事件安全丢弃', async () => {
    const g = await createTestGame({ main: Scene })
    const b = g.scene.add(new Button({ position: v(100, 100) }))
    g.pointerDown(100, 100)
    g.step()
    b.queueFree()
    g.step()
    g.pointerUp(100, 100)
    g.step()
    expect(b.log).toEqual(['down (100, 100)@(0, 0)'])
    expect(g.tree.input.isPointerPressed).toBe(false)
  })
})

describe('InputMap', () => {
  /** 每帧记录动作状态 */
  class Recorder extends Node {
    frames: string[] = []
    override process() {
      const i = this.tree.input
      const flags = [i.isActionJustPressed('drop') && 'drop!', i.isActionPressed('drop') && 'drop', i.isActionJustReleased('drop') && 'drop^', i.isActionJustPressed('jump') && 'jump!']
      this.frames.push(flags.filter(Boolean).join(' '))
    }
  }

  async function setup() {
    const g = await createTestGame({ main: Scene, actions: { drop: [pointerPress(), key('Space')], jump: [key('KeyW'), key('ArrowUp')] } })
    const rec = g.scene.add(new Recorder())
    return { g, rec }
  }

  it('点击空白处触发 pointer 绑定：按下那一帧 justPressed，抬起那一帧 justReleased', async () => {
    const { g, rec } = await setup()
    g.tap(10, 10)
    expect(rec.frames).toEqual(['drop! drop', 'drop^'])
  })

  it('按下被可点击节点处理掉时，不触发 pointer 绑定', async () => {
    const { g, rec } = await setup()
    g.scene.add(new Button({ position: v(100, 100) }))
    g.tap(100, 100)
    expect(rec.frames).toEqual(['', ''])
  })

  it('键盘绑定；任意一个绑定按下即为按下', async () => {
    const { g, rec } = await setup()
    g.pressKey('ArrowUp')
    g.keyDown('Space')
    g.step(2)
    g.keyUp('Space')
    g.step()
    expect(rec.frames).toEqual(['jump!', '', 'drop! drop', 'drop', 'drop^'])
    expect(g.tree.input.isKeyPressed('Space')).toBe(false)
  })

  it('同一帧内按下又松开：justPressed 和 justReleased 都为 true', async () => {
    const { g, rec } = await setup()
    g.keyDown('Space')
    g.keyUp('Space')
    g.step()
    expect(rec.frames).toEqual(['drop! drop^'])
  })

  it('未定义的动作给出明确报错；运行时可以增删动作', async () => {
    const g = await createTestGame({ main: Scene })
    expect(() => g.tree.input.isActionPressed('jump')).toThrow(/Unknown input action "jump".*Known actions: \(none\)/)
    g.tree.input.addAction('jump', [key('KeyW')])
    g.keyDown('KeyW')
    g.step()
    expect(g.tree.input.isActionPressed('jump')).toBe(true)
  })

  it('未注册的动作名是类型错误', async () => {
    const g = await createTestGame({ main: Scene })
    // @ts-expect-error 'fire' 没有在 ActionRegistry 中注册
    expect(() => g.tree.input.isActionPressed('fire')).toThrow()
  })
})
