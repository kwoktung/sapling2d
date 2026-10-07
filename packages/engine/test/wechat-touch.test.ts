import { describe, expect, it } from 'vitest'
import { Node2D, rect, Scene, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { subscribeTouches, type WxTouchApi, type WxTouchEvent } from '../src/platform/wechat/touch'

/** 假的 wx 触摸 API：可以手动触发事件 */
function fakeWx() {
  const listeners: Record<string, Set<(e: WxTouchEvent) => void>> = { start: new Set(), move: new Set(), end: new Set(), cancel: new Set() }
  const api: WxTouchApi = {
    onTouchStart: (cb) => listeners.start!.add(cb),
    onTouchMove: (cb) => listeners.move!.add(cb),
    onTouchEnd: (cb) => listeners.end!.add(cb),
    onTouchCancel: (cb) => listeners.cancel!.add(cb),
    offTouchStart: (cb) => listeners.start!.delete(cb),
    offTouchMove: (cb) => listeners.move!.delete(cb),
    offTouchEnd: (cb) => listeners.end!.delete(cb),
    offTouchCancel: (cb) => listeners.cancel!.delete(cb),
  }
  const fire = (kind: 'start' | 'move' | 'end' | 'cancel', touches: [id: number, x: number, y: number][]) => {
    const e = { changedTouches: touches.map(([identifier, clientX, clientY]) => ({ identifier, clientX, clientY })) }
    for (const cb of listeners[kind]!) cb(e)
  }
  return { api, fire, listenerCount: () => Object.values(listeners).reduce((n, s) => n + s.size, 0) }
}

/** spike 里那台 iPhone：402×874，屏幕中心 (201, 437) 对应设计坐标 (375, 667) */
const IPHONE = { width: 402, height: 874, pixelRatio: 3 }

class Button extends Node2D {
  log: string[] = []
  constructor(opts: ConstructorParameters<typeof Node2D>[0] = {}) {
    super({ inputPickable: true, hitArea: rect(-60, -60, 120, 120), ...opts })
  }
  override ready() {
    this.pointerDown.connect((e) => this.log.push(`down#${e.pointerId} ${e.position}`))
    this.pointerMove.connect((e) => this.log.push(`move#${e.pointerId} ${e.position}`))
    this.pointerUp.connect((e) => this.log.push(`up#${e.pointerId} ${e.position}`))
    this.clicked.connect((e) => this.log.push(`click#${e.pointerId}`))
  }
}

describe('微信触摸 → 引擎指针事件', () => {
  async function setup() {
    const g = await createTestGame({ main: Scene, screen: IPHONE })
    const wx = fakeWx()
    const unsubscribe = subscribeTouches(wx.api, (e) => g.platform.injectInput(e))
    return { g, wx, unsubscribe }
  }

  it('点击：窗口坐标换算成设计坐标，节点收到 down / up / click', async () => {
    const { g, wx } = await setup()
    const b = g.scene.add(new Button({ position: v(375, 667) }))
    wx.fire('start', [[0, 201, 437]])
    g.step()
    wx.fire('end', [[0, 201, 437]])
    g.step()
    expect(b.log.map((l) => l.replace(/\(([\d.]+), ([\d.]+)\)/, (_, x, y) => `(${Math.round(+x)}, ${Math.round(+y)})`))).toEqual([
      'down#0 (375, 667)',
      'up#0 (375, 667)',
      'click#0',
    ])
  })

  it('拖拽：移动事件发给按下时命中的节点', async () => {
    const { g, wx } = await setup()
    const b = g.scene.add(new Button({ position: v(375, 667) }))
    wx.fire('start', [[3, 201, 437]])
    g.step()
    wx.fire('move', [[3, 250, 437]])
    g.step()
    wx.fire('end', [[3, 300, 437]])
    g.step()
    expect(b.log.map((l) => l.split(' ')[0])).toEqual(['down#3', 'move#3', 'up#3']) // 在区域外抬起：没有 click
  })

  it('多点触控：一次事件里的多个 changedTouches 各自成为一个指针', async () => {
    const { g, wx } = await setup()
    const left = g.scene.add(new Button({ name: 'L', position: v(150, 667) }))
    const right = g.scene.add(new Button({ name: 'R', position: v(600, 667) }))
    const toScreen = (x: number) => g.tree.viewport.designToScreen(v(x, 667))
    const l = toScreen(150)
    const r = toScreen(600)
    wx.fire('start', [
      [0, l.x, l.y],
      [1, r.x, r.y],
    ])
    g.step()
    expect(g.tree.input.pressedPointers.size).toBe(2)
    wx.fire('end', [
      [0, l.x, l.y],
      [1, r.x, r.y],
    ])
    g.step()
    expect(left.log.at(-1)).toBe('click#0')
    expect(right.log.at(-1)).toBe('click#1')
  })

  it('touchcancel：抬起但不触发 click', async () => {
    const { g, wx } = await setup()
    const b = g.scene.add(new Button({ position: v(375, 667) }))
    wx.fire('start', [[0, 201, 437]])
    g.step()
    wx.fire('cancel', [[0, 201, 437]])
    g.step()
    expect(b.log.map((l) => l.split(' ')[0])).toEqual(['down#0', 'up#0'])
    expect(g.tree.input.isPointerPressed).toBe(false)
  })

  it('取消订阅后不再收到事件', async () => {
    const { wx, unsubscribe } = await setup()
    expect(wx.listenerCount()).toBe(4)
    unsubscribe()
    expect(wx.listenerCount()).toBe(0)
  })
})
