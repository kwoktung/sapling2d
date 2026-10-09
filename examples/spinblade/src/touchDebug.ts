import { type Game, type RawInputEvent, v } from 'sapling2d'
import { Arena } from './scenes/Arena'

/**
 * 摇杆诊断（`VITE_TOUCH_DEBUG=1` 构建）：把每次按下和摇杆的每次按压打到日志里。
 * - `[touch] down …`：手指按下的设计坐标、按下后摇杆有没有接住、没接住时摇杆是否还被别的手指占着；
 * - `[stick] …`：一次按压的时长、拖动的最远距离、达到的最大力度。
 */
export function installTouchDebug(game: Game): void {
  const tree = game.tree
  const input = tree.input
  const original = input._enqueue.bind(input)
  let presses = 0
  let maxDrag = 0
  let maxStrength = 0
  let pressedAt = 0

  const stick = () => (tree.currentScene instanceof Arena ? tree.currentScene.hud?.joystick ?? null : null)

  input._enqueue = (e: RawInputEvent) => {
    original(e)
    if (e.type !== 'pointerdown' && e.type !== 'pointerup' && e.type !== 'pointercancel') return
    const d = tree.viewport.screenToDesign(v(e.x, e.y))
    const s = stick()
    const heldBy = s?._pointerId ?? null
    // 事件在下一帧开始时处理：等两帧再看结果
    const frame = tree.processFrames
    const check = () => {
      if (tree.processFrames < frame + 2) return void setTimeout(check, 8)
      const after = stick()
      const claimed = e.type === 'pointerdown' ? after?._pointerId === e.pointerId : null
      console.log(
        `[touch] ${e.type} id=${e.pointerId} at (${d.x.toFixed(0)}, ${d.y.toFixed(0)})` +
          (e.type === 'pointerdown' ? ` claimed=${claimed} heldBefore=${heldBy}` : ` stickHeld=${after?._pointerId ?? null}`),
      )
    }
    check()
  }

  // 摇杆按着时，每 16ms 记一次拖动距离和力度
  setInterval(() => {
    const s = stick()
    if (!s) return
    if (s.isPressed) {
      if (pressedAt === 0) {
        pressedAt = Date.now()
        maxDrag = 0
        maxStrength = 0
      }
      const knob = s.children.find((n) => n.name === 'Knob') as { x: number; y: number } | undefined
      if (knob) maxDrag = Math.max(maxDrag, Math.hypot(knob.x, knob.y))
      maxStrength = Math.max(maxStrength, Math.hypot(s.vectorX, s.vectorY))
    } else if (pressedAt !== 0) {
      presses++
      console.log(`[stick] press#${presses} ${((Date.now() - pressedAt) / 1000).toFixed(2)}s maxDrag ${maxDrag.toFixed(0)}px/${s.radius} maxStrength ${maxStrength.toFixed(2)}`)
      pressedAt = 0
    }
  }, 16)
}
