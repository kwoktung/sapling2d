/** 指针事件。坐标是窗口逻辑像素（与 ScreenInfo 一致），由引擎换算成设计坐标。 */
export type RawPointerEvent = { type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel'; pointerId: number; x: number; y: number }

/** 键盘事件，只有浏览器平台会产生。 */
export type RawKeyEvent = { type: 'keydown' | 'keyup'; code: string }

/** 平台产出的原始输入事件。 */
export type RawInputEvent = RawPointerEvent | RawKeyEvent
