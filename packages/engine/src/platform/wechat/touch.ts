import type { RawInputEvent } from '../../core/Input'

/** wx 触摸事件里引擎用到的部分（见 spikes/wechat/REPORT.md 第 5 节）。 */
export interface WxTouchEvent {
  changedTouches: { identifier: number; clientX: number; clientY: number }[]
}

type TouchListener = (e: WxTouchEvent) => void

/** wx.onTouchStart / offTouchStart 等，作为参数传入，方便测试。 */
export interface WxTouchApi {
  onTouchStart(cb: TouchListener): void
  onTouchMove(cb: TouchListener): void
  onTouchEnd(cb: TouchListener): void
  onTouchCancel(cb: TouchListener): void
  offTouchStart?(cb: TouchListener): void
  offTouchMove?(cb: TouchListener): void
  offTouchEnd?(cb: TouchListener): void
  offTouchCancel?(cb: TouchListener): void
}

/**
 * 把 wx 的全局触摸事件转换成引擎的原始指针事件：每个 changedTouch 一个事件，
 * pointerId 是触摸的 identifier，坐标是窗口逻辑像素（clientX / clientY，与 getWindowInfo 一致）。
 * 返回取消订阅的函数。
 */
export function subscribeTouches(api: WxTouchApi, callback: (event: RawInputEvent) => void): () => void {
  const make = (type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel'): TouchListener => (e) => {
    for (const t of e.changedTouches) callback({ type, pointerId: t.identifier, x: t.clientX, y: t.clientY })
  }
  const start = make('pointerdown')
  const move = make('pointermove')
  const end = make('pointerup')
  const cancel = make('pointercancel')
  api.onTouchStart(start)
  api.onTouchMove(move)
  api.onTouchEnd(end)
  api.onTouchCancel(cancel)
  return () => {
    api.offTouchStart?.(start)
    api.offTouchMove?.(move)
    api.offTouchEnd?.(end)
    api.offTouchCancel?.(cancel)
  }
}
