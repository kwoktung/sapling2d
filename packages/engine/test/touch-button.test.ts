import { afterEach, describe, expect, it, vi } from 'vitest'
import { Camera2D, CanvasLayer, key, Node2D, pointerPress, Rect2, Scene, tex, TouchScreenButton, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

declare module 'sapling2d' {
  interface ActionRegistry {
    tbLeft: true
    tbRight: true
    tbJump: true
    tbTap: true
  }
}

const AREA = new Rect2(-50, -50, 100, 100)
const actions = { tbLeft: [key('ArrowLeft')], tbRight: [key('ArrowRight')], tbJump: [key('Space')], tbTap: [pointerPress()] }

async function setup(build: (scene: Scene) => void) {
  class Main extends Scene {
    override ready() {
      build(this)
    }
  }
  const g = await createTestGame({ main: Main, actions })
  g.step()
  return g
}

describe('TouchScreenButton', () => {
  it('按住时动作处于按下状态；和键盘绑定同一个动作时两者都能触发', async () => {
    const g = await setup((scene) => scene.add(new TouchScreenButton({ action: 'tbJump', position: v(100, 100), hitArea: AREA })))
    const input = g.tree.input
    g.pointerDown(100, 100, 1)
    g.step()
    expect([input.isActionPressed('tbJump'), input.isActionJustPressed('tbJump')]).toEqual([true, true])
    g.step()
    expect([input.isActionPressed('tbJump'), input.isActionJustPressed('tbJump')]).toEqual([true, false])
    g.pointerUp(100, 100, 1)
    g.step()
    expect([input.isActionPressed('tbJump'), input.isActionJustReleased('tbJump')]).toEqual([false, true])
    g.pressKey('Space')
    expect(input.isActionJustReleased('tbJump')).toBe(true)
  })

  it('多点触控：两个手指各按一个按钮；同一个按钮被两个手指按住时，最后一个离开才松开', async () => {
    let right!: TouchScreenButton
    const g = await setup((scene) => {
      right = scene.add(new TouchScreenButton({ action: 'tbRight', position: v(100, 1200), hitArea: AREA }))
      scene.add(new TouchScreenButton({ action: 'tbJump', position: v(650, 1200), hitArea: AREA }))
    })
    const input = g.tree.input
    g.pointerDown(100, 1200, 1)
    g.pointerDown(650, 1200, 2)
    g.step()
    expect([input.isActionPressed('tbRight'), input.isActionPressed('tbJump')]).toEqual([true, true])
    g.pointerDown(110, 1210, 3) // 第二个手指也按在“右”上
    g.pointerUp(100, 1200, 1)
    g.step()
    expect([right.isPressed, input.isActionPressed('tbRight')]).toEqual([true, true])
    g.pointerUp(110, 1210, 3)
    g.step()
    expect([right.isPressed, input.isActionPressed('tbRight'), input.isActionPressed('tbJump')]).toEqual([false, false, true])
  })

  it('手指滑出按钮就松开；passbyPress 的按钮滑进来就按下，不是的不会', async () => {
    const g = await setup((scene) => {
      scene.add(new TouchScreenButton({ action: 'tbLeft', position: v(100, 1200), hitArea: AREA, passbyPress: true }))
      scene.add(new TouchScreenButton({ action: 'tbRight', position: v(300, 1200), hitArea: AREA, passbyPress: true }))
      scene.add(new TouchScreenButton({ action: 'tbJump', position: v(500, 1200), hitArea: AREA }))
    })
    const input = g.tree.input
    const state = () => [input.isActionPressed('tbLeft'), input.isActionPressed('tbRight'), input.isActionPressed('tbJump')]
    g.pointerDown(100, 1200, 1)
    g.step()
    expect(state()).toEqual([true, false, false])
    g.pointerMove(300, 1200, 1) // 从“左”滑到“右”
    g.step()
    expect(state()).toEqual([false, true, false])
    g.pointerMove(500, 1200, 1) // 滑到“跳”：不是 passbyPress，不按下
    g.step()
    expect(state()).toEqual([false, false, false])
  })

  it('触摸取消、切到后台都会松开（包括按着的键盘按键）', async () => {
    const g = await setup((scene) => scene.add(new TouchScreenButton({ action: 'tbJump', position: v(100, 100), hitArea: AREA })))
    const input = g.tree.input
    g.platform.injectInput({ type: 'pointerdown', pointerId: 4, x: 100, y: 100 })
    g.step()
    g.platform.injectInput({ type: 'pointercancel', pointerId: 4, x: 100, y: 100 })
    g.step()
    expect(input.isActionPressed('tbJump')).toBe(false)

    g.pointerDown(100, 100, 5)
    g.keyDown('ArrowLeft')
    g.step()
    expect([input.isActionPressed('tbJump'), input.isActionPressed('tbLeft')]).toEqual([true, true])
    g.setFocus(false)
    g.setFocus(true)
    g.step()
    expect([input.isActionPressed('tbJump'), input.isActionPressed('tbLeft'), input.isPointerPressed]).toEqual([false, false, false])
  })

  it('触摸区域：设置了 hitArea 就用它（可以比贴图大）；没有贴图尺寸也没有 hitArea 时按不到', async () => {
    const g = await setup((scene) => {
      scene.add(new TouchScreenButton({ action: 'tbJump', texture: tex('tb-jump.png'), position: v(100, 100) })) // 无头模式贴图尺寸为 0
      scene.add(new TouchScreenButton({ action: 'tbLeft', position: v(400, 100), hitArea: new Rect2(-120, -120, 240, 240) }))
    })
    g.pointerDown(100, 100, 1)
    g.pointerDown(400 + 110, 100, 2)
    g.step()
    expect([g.tree.input.isActionPressed('tbJump'), g.tree.input.isActionPressed('tbLeft')]).toEqual([false, true])
  })

  it('按在按钮上的手指不触发 pointerPress()，也不点中下面的节点', async () => {
    const hits: string[] = []
    const g = await setup((scene) => {
      const under = scene.add(new Node2D({ position: v(100, 100), inputPickable: true, hitArea: AREA }))
      under.pointerDown.connect(() => hits.push('under'))
      scene.add(new TouchScreenButton({ action: 'tbJump', position: v(100, 100), hitArea: AREA }))
    })
    g.tap(100, 100)
    expect([hits, g.tree.input.isActionJustPressed('tbTap')]).toEqual([[], false])
    g.pointerDown(400, 400, 1) // 按钮外：pointerPress() 照常触发
    g.step()
    expect(g.tree.input.isActionJustPressed('tbTap')).toBe(true)
  })

  it('信号和按下贴图；CanvasLayer 里的按钮按屏幕位置判断（不受相机影响）', async () => {
    const normal = tex('tb-normal.png')
    const down = tex('tb-down.png')
    let button!: TouchScreenButton
    const log: string[] = []
    const g = await setup((scene) => {
      scene.add(new Camera2D({ position: v(5000, 5000) }))
      button = scene.add(new CanvasLayer()).add(new TouchScreenButton({ action: 'tbJump', texture: normal, texturePressed: down, position: v(100, 100), hitArea: AREA }))
      button.pressed.connect(() => log.push('pressed'))
      button.released.connect(() => log.push('released'))
    })
    g.pointerDown(100, 100, 1)
    g.step()
    expect(button.texture).toBe(down)
    expect(g.dump()).toContain('action=tbJump pressed=true')
    g.pointerUp(100, 100, 1)
    g.step()
    expect([button.texture, log]).toEqual([normal, ['pressed', 'released']])
  })

  it('隐藏或暂停时按不下；按着时被移除会松开动作；未知动作报错', async () => {
    let button!: TouchScreenButton
    const g = await setup((scene) => {
      button = scene.add(new TouchScreenButton({ action: 'tbJump', position: v(100, 100), hitArea: AREA }))
    })
    const input = g.tree.input
    button.visible = false
    g.tap(100, 100)
    expect(input.isActionJustPressed('tbJump')).toBe(false)
    button.visible = true
    g.tree.paused = true
    g.pointerDown(100, 100, 1)
    g.step()
    expect(input.isActionPressed('tbJump')).toBe(false)
    g.pointerUp(100, 100, 1)
    g.tree.paused = false
    g.pointerDown(100, 100, 2)
    g.step()
    expect(input.isActionPressed('tbJump')).toBe(true)
    button.queueFree() // 等待销毁的按钮不能再按：下一帧开始时松开，所有节点在同一帧看到
    g.step()
    expect([input.isActionPressed('tbJump'), input.isActionJustReleased('tbJump')]).toEqual([false, true])
  })

  it('未知动作：警告，按钮照常进入树，按下不影响任何动作', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let button!: TouchScreenButton
    const g = await setup((scene) => {
      button = scene.add(new TouchScreenButton({ name: 'Typo', action: 'nope' as never, position: v(100, 100), hitArea: AREA }))
    })
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/"Typo": unknown input action "nope"/)
    g.pointerDown(100, 100, 1)
    g.step()
    expect([button.isInsideTree, button.isPressed]).toEqual([true, true])
  })
})

afterEach(() => vi.restoreAllMocks())

describe('TouchScreenButton 审查修复', () => {
  it('缩放为 0 的按钮不会被任何地方按到', async () => {
    const g = await setup((scene) => scene.add(new TouchScreenButton({ action: 'tbJump', position: v(100, 100), scale: v(0, 0), hitArea: AREA })))
    g.pointerDown(600, 900, 1)
    g.step()
    expect(g.tree.input.isActionPressed('tbJump')).toBe(false)
  })

  it('信号回调里移除按钮不会让别的按钮卡住', async () => {
    let a!: TouchScreenButton
    let b!: TouchScreenButton
    const g = await setup((scene) => {
      a = scene.add(new TouchScreenButton({ action: 'tbLeft', position: v(100, 100), hitArea: AREA }))
      b = scene.add(new TouchScreenButton({ action: 'tbRight', position: v(110, 100), hitArea: AREA }))
      a.released.connect(() => a.queueFree())
    })
    g.pointerDown(105, 100, 1) // 两个按钮重叠，同时按下
    g.step()
    expect([a.isPressed, b.isPressed]).toEqual([true, true])
    g.pointerUp(105, 100, 1)
    g.step()
    g.step()
    expect([b.isPressed, g.tree.input.isActionPressed('tbRight')]).toEqual([false, false])
  })

  it('画在按钮上面的可点击节点（更高的 CanvasLayer）先收到指针', async () => {
    const hits: string[] = []
    const g = await setup((scene) => {
      scene.add(new CanvasLayer({ layer: 1 })).add(new TouchScreenButton({ action: 'tbJump', position: v(100, 100), hitArea: AREA }))
      const dialog = scene.add(new CanvasLayer({ layer: 5 })).add(new Node2D({ position: v(100, 100), inputPickable: true, hitArea: AREA }))
      dialog.pointerDown.connect(() => hits.push('dialog'))
    })
    g.tap(100, 100)
    expect([hits, g.tree.input.isActionJustPressed('tbJump')]).toEqual([['dialog'], false])
  })

  it('从空白处滑进 passbyPress 按钮后，不再算 pointerPress() 的按下；拖着节点的手指滑过按钮不会按下它', async () => {
    let dragged!: Node2D
    const g = await setup((scene) => {
      scene.add(new TouchScreenButton({ action: 'tbRight', position: v(300, 300), hitArea: AREA, passbyPress: true }))
      dragged = scene.add(new Node2D({ position: v(600, 300), inputPickable: true, hitArea: AREA }))
    })
    const input = g.tree.input
    g.pointerDown(100, 300, 1)
    g.step()
    expect(input.isActionPressed('tbTap')).toBe(true)
    g.pointerMove(300, 300, 1)
    g.step()
    expect([input.isActionPressed('tbRight'), input.isActionPressed('tbTap')]).toEqual([true, false])
    g.pointerUp(300, 300, 1)
    g.pointerDown(600, 300, 2) // 按在可拖动的节点上
    g.step()
    g.pointerMove(300, 300, 2)
    g.step()
    expect(input.isActionPressed('tbRight')).toBe(false)
    expect(dragged.isInsideTree).toBe(true)
  })

  it('拖着的节点中途被销毁后，这个手指不再算拖着节点：滑进 passbyPress 按钮会按下', async () => {
    let dragged!: Node2D
    const g = await setup((scene) => {
      scene.add(new TouchScreenButton({ action: 'tbRight', position: v(300, 300), hitArea: AREA, passbyPress: true }))
      dragged = scene.add(new Node2D({ position: v(600, 300), inputPickable: true, hitArea: AREA }))
    })
    g.pointerDown(600, 300, 1)
    g.step()
    dragged.queueFree()
    g.step()
    g.pointerMove(300, 300, 1)
    g.step()
    expect(g.tree.input.isActionPressed('tbRight')).toBe(true)
  })

  it('切到后台时，队列里还没处理的按下也会被取消', async () => {
    const g = await setup((scene) => scene.add(new TouchScreenButton({ action: 'tbJump', position: v(100, 100), hitArea: AREA })))
    g.pointerDown(100, 100, 9) // 还在队列里
    g.keyDown('ArrowLeft')
    g.setFocus(false)
    g.setFocus(true)
    g.step()
    g.step()
    expect([g.tree.input.isActionPressed('tbJump'), g.tree.input.isActionPressed('tbLeft'), g.tree.input.isPointerPressed]).toEqual([false, false, false])
  })

  it('按着的按钮被隐藏或暂停时，下一帧松开', async () => {
    let button!: TouchScreenButton
    const g = await setup((scene) => {
      button = scene.add(new TouchScreenButton({ action: 'tbJump', position: v(100, 100), hitArea: AREA }))
    })
    g.pointerDown(100, 100, 1)
    g.step()
    button.visible = false
    g.step()
    expect([button.isPressed, g.tree.input.isActionPressed('tbJump')]).toEqual([false, false])
    button.visible = true
    g.pointerUp(100, 100, 1)
    g.pointerDown(100, 100, 2)
    g.step()
    g.tree.paused = true
    g.step()
    expect(button.isPressed).toBe(false)
  })

})
