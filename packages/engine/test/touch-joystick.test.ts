import { describe, expect, it, vi } from 'vitest'
import { Camera2D, CanvasLayer, key, Node2D, pointerPress, Rect2, Scene, tex, TouchJoystick, TouchScreenButton, v, type TouchJoystickOptions } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

declare module 'sapling2d' {
  interface ActionRegistry {
    tjLeft: true
    tjRight: true
    tjUp: true
    tjDown: true
    tjFire: true
    tjTap: true
  }
}

const actions = {
  tjLeft: [key('KeyA')],
  tjRight: [key('KeyD')],
  tjUp: [key('KeyW')],
  tjDown: [key('KeyS')],
  tjFire: [key('Space')],
  tjTap: [pointerPress()],
}
const DIRS = { left: 'tjLeft', right: 'tjRight', up: 'tjUp', down: 'tjDown' } as const

async function setup(options: TouchJoystickOptions = {}, build?: (scene: Scene, hud: CanvasLayer) => void) {
  class Main extends Scene {
    hud!: CanvasLayer
    stick!: TouchJoystick
    override ready() {
      this.hud = this.add(new CanvasLayer())
      this.stick = this.hud.add(new TouchJoystick({ actions: DIRS, ...options }))
      build?.(this, this.hud)
    }
  }
  const g = await createTestGame({ main: Main, actions })
  g.step()
  const scene = g.scene as Main
  return { g, input: g.tree.input, stick: scene.stick, scene }
}

describe('动作力度', () => {
  it('按键的力度是 1；getAxis、getVector；斜着按长度不超过 1', async () => {
    const { g, input } = await setup()
    expect([input.getActionStrength('tjRight'), input.getAxis('tjLeft', 'tjRight')]).toEqual([0, 0])
    g.keyDown('KeyD')
    g.step()
    expect([input.getActionStrength('tjRight'), input.getAxis('tjLeft', 'tjRight')]).toEqual([1, 1])
    g.keyDown('KeyA')
    g.step()
    expect(input.getAxis('tjLeft', 'tjRight')).toBe(0)
    g.keyUp('KeyA')
    g.keyDown('KeyW')
    g.step()
    const dir = input.getVector('tjLeft', 'tjRight', 'tjUp', 'tjDown')
    expect(dir.x).toBeCloseTo(Math.SQRT1_2)
    expect(dir.y).toBeCloseTo(-Math.SQRT1_2)
    expect(() => input.getActionStrength('nope' as 'tjLeft')).toThrow(/Unknown input action/)
  })
})

describe('TouchJoystick', () => {
  it('dynamic：在左半边按下的地方出现，拖动给出方向和力度（扣掉死区）', async () => {
    const { g, input, stick } = await setup()
    g.pointerDown(200, 1000)
    g.step()
    expect([stick.isPressed, stick.x, stick.y]).toEqual([true, 200, 1000])
    expect(input.getVector('tjLeft', 'tjRight', 'tjUp', 'tjDown')).toEqual(v(0, 0))

    g.pointerMove(300, 1000) // 推到底
    g.step()
    expect([input.getActionStrength('tjRight'), input.isActionPressed('tjRight'), input.isActionJustPressed('tjRight')]).toEqual([1, true, true])

    g.pointerMove(240, 1000) // 推了 40%：扣掉 20% 死区，力度 (0.4 - 0.2) / 0.8 = 0.25，没到 0.5 不算按下
    g.step()
    expect(input.getActionStrength('tjRight')).toBeCloseTo(0.25)
    expect([input.isActionPressed('tjRight'), input.isActionJustReleased('tjRight')]).toEqual([false, true])
    expect(input.getVector('tjLeft', 'tjRight', 'tjUp', 'tjDown').x).toBeCloseTo(0.25)

    g.pointerMove(215, 1000) // 死区内
    g.step()
    expect(input.getActionStrength('tjRight')).toBe(0)

    g.pointerMove(400, 1200) // 斜着推出很远：长度 1，两个方向各 0.707，都算按下
    g.step()
    expect(stick.vectorX).toBeCloseTo(Math.SQRT1_2)
    expect(stick.vectorY).toBeCloseTo(Math.SQRT1_2)
    expect([input.isActionPressed('tjRight'), input.isActionPressed('tjDown'), input.getActionStrength('tjLeft')]).toEqual([true, true, 0])

    g.pointerUp(400, 1200)
    g.step()
    expect([stick.isPressed, stick.vectorX, stick.vectorY]).toEqual([false, 0, 0])
    expect([input.getActionStrength('tjRight'), input.isActionJustReleased('tjRight')]).toEqual([0, true])
  })

  it('拖着摇杆的手指抬起丢了（真机偶尔丢 touchend）：同一个 id 再按下时摇杆先松开，不会一直推着', async () => {
    const { g, input, stick } = await setup()
    g.pointerDown(200, 1000, 1)
    g.pointerMove(300, 1000, 1)
    g.step()
    expect(input.isActionPressed('tjRight')).toBe(true)
    g.pointerDown(150, 900, 1) // 上一次的 pointerup 没有收到：在新位置重新按下摇杆
    g.step()
    expect([stick.isPressed, stick.x, stick.y, stick.vectorX]).toEqual([true, 150, 900, 0])
    expect([input.isActionPressed('tjRight'), input.isActionJustReleased('tjRight')]).toEqual([false, true])
  })

  it('g.drag 可以驱动摇杆', async () => {
    let maxLeft = 0
    const { g, input } = await setup({}, (scene) => {
      // 每帧记下 left 的力度
      class Probe extends Node2D {
        override process() {
          maxLeft = Math.max(maxLeft, this.tree.input.getActionStrength('tjLeft'))
        }
      }
      scene.add(new Probe())
    })
    g.drag(v(300, 900), v(150, 900), { frames: 5 })
    expect(maxLeft).toBe(1)
    expect(input.getActionStrength('tjLeft')).toBe(0) // 抬起后归零
  })

  it('dynamic：区域外的按下不归摇杆；按着摇杆的手指不触发 pointerPress()，另一个手指可以', async () => {
    const { g, input, stick } = await setup()
    g.pointerDown(600, 1000, 1) // 右半边
    g.step()
    expect([stick.isPressed, input.isActionPressed('tjTap')]).toEqual([false, true])
    g.pointerUp(600, 1000, 1)
    g.pointerDown(100, 1000, 2) // 左半边：摇杆
    g.step()
    expect([stick.isPressed, input.isActionPressed('tjTap')]).toEqual([true, false])
    g.pointerDown(150, 900, 3) // 摇杆已经被按着：第二个手指不归它
    g.step()
    expect(input.isActionPressed('tjTap')).toBe(true)
    expect(stick.x).toBe(100)
  })

  it('region 可以自定义', async () => {
    const { g, stick } = await setup({ region: new Rect2(0, 1000, 750, 334) })
    g.pointerDown(600, 600)
    g.step()
    expect(stick.isPressed).toBe(false)
    g.pointerUp(600, 600)
    g.pointerDown(600, 1100)
    g.step()
    expect(stick.isPressed).toBe(true)
  })

  it('fixed：位置不动，只在触摸区域里按下才算', async () => {
    const { g, input, stick } = await setup({ mode: 'fixed', position: v(150, 1150), radius: 80 })
    g.pointerDown(150 + 130, 1150) // 默认触摸区域是半径 1.5 × 80 = 120 的圆
    g.step()
    expect(stick.isPressed).toBe(false)
    g.pointerUp(280, 1150)
    g.pointerDown(150, 1150 - 100) // 区域内、偏上：一按下就有方向
    g.step()
    expect([stick.isPressed, stick.x, stick.y]).toEqual([true, 150, 1150])
    expect(input.isActionPressed('tjUp')).toBe(true)
  })

  it('一个手指按着摇杆，另一个手指同时按屏幕按钮；拖摇杆的手指滑过 passbyPress 按钮不会按下它', async () => {
    const { g, input } = await setup({}, (_, hud) => {
      hud.add(new TouchScreenButton({ action: 'tjFire', position: v(600, 1100), hitArea: new Rect2(-60, -60, 120, 120) }))
      hud.add(new TouchScreenButton({ action: 'tjTap', position: v(350, 1100), hitArea: new Rect2(-60, -60, 120, 120), passbyPress: true }))
    })
    g.pointerDown(150, 1100, 1)
    g.pointerDown(600, 1100, 2)
    g.step()
    g.pointerMove(350, 1100, 1) // 拖过 passby 按钮
    g.step()
    expect([input.isActionPressed('tjRight'), input.isActionPressed('tjFire'), input.isActionPressed('tjTap')]).toEqual([true, true, false])
  })

  it('画在上面的按钮先收到指针：区域里的按钮照常能按', async () => {
    const { g, input, stick } = await setup({}, (_, hud) => {
      hud.add(new TouchScreenButton({ action: 'tjFire', position: v(100, 200), hitArea: new Rect2(-50, -50, 100, 100) }))
    })
    g.pointerDown(100, 200)
    g.step()
    expect([input.isActionPressed('tjFire'), stick.isPressed]).toEqual([true, false])
  })

  it('键盘和摇杆同时作用时取最大的力度', async () => {
    const { g, input } = await setup()
    g.pointerDown(200, 1000)
    g.pointerMove(240, 1000)
    g.step()
    expect(input.getActionStrength('tjRight')).toBeCloseTo(0.25)
    g.keyDown('KeyD')
    g.step()
    expect(input.getActionStrength('tjRight')).toBe(1)
    g.keyUp('KeyD')
    g.step()
    expect(input.getActionStrength('tjRight')).toBeCloseTo(0.25)
  })

  it('切到后台、触摸取消、隐藏、移出树时松开，力度归零', async () => {
    const { g, input, stick } = await setup()
    const press = () => {
      g.pointerDown(200, 1000)
      g.pointerMove(300, 1000)
      g.step()
      expect(input.isActionPressed('tjRight')).toBe(true)
    }
    press()
    g.setFocus(false)
    g.setFocus(true)
    g.step()
    expect([stick.isPressed, input.isActionPressed('tjRight')]).toEqual([false, false])

    press()
    stick.visible = false
    g.step()
    expect([stick.isPressed, input.isActionPressed('tjRight')]).toEqual([false, false])
    stick.visible = true
    g.pointerUp(300, 1000)
    g.step()

    press()
    stick.parent!.remove(stick)
    g.step()
    expect([stick.isPressed, input.isActionPressed('tjRight')]).toEqual([false, false])
  })

  it('暂停时按不下（processMode 默认可暂停）', async () => {
    const { g, stick } = await setup()
    g.tree.paused = true
    g.pointerDown(200, 1000)
    g.step()
    expect(stick.isPressed).toBe(false)
  })

  it('贴图：dynamic 没按着时隐藏；摇杆头跟着手指，最远到 radius', async () => {
    class Main extends Scene {
      static override assets = { base: tex('arrow.png'), knob: tex('jump.png') }
      stick!: TouchJoystick
      override ready() {
        const hud = this.add(new CanvasLayer())
        this.stick = hud.add(new TouchJoystick({ actions: DIRS, texture: Main.assets.base, textureKnob: Main.assets.knob }))
      }
    }
    const g = await createTestGame({ main: Main, actions })
    g.step()
    const stick = (g.scene as Main).stick
    const [base, knob] = stick.children as Node2D[]
    expect([base!.visible, knob!.visible]).toEqual([false, false])
    g.pointerDown(200, 1000)
    g.pointerMove(200, 700)
    g.step()
    expect([base!.visible, knob!.visible]).toEqual([true, true])
    expect(knob!.position).toEqual(v(0, -100))
    expect(g.dump()).toContain('pressed=true vector=(0.00, -1.00)')
    g.pointerUp(200, 700)
    g.step()
    expect([base!.visible, knob!.visible, knob!.position]).toEqual([false, false, v(0, 0)])
  })

  it('CanvasLayer 里按屏幕位置判断，不受相机影响', async () => {
    const { g, stick } = await setup({}, (scene) => {
      const cam = scene.add(new Camera2D())
      cam.position = v(5000, 5000)
    })
    g.pointerDown(200, 1000)
    g.step()
    expect([stick.isPressed, stick.x, stick.y]).toEqual([true, 200, 1000])
  })

  it('未定义的动作：打印警告，摇杆照常工作', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { g, stick } = await setup({ actions: { left: 'missing' as 'tjLeft' } })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown input action "missing"'))
    warn.mockRestore()
    g.pointerDown(200, 1000)
    g.pointerMove(100, 1000)
    g.step()
    expect(stick.vectorX).toBe(-1)
  })
})
