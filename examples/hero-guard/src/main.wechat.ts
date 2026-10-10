import { startGame } from 'sapling2d/wechat'
import { gameOptions } from './game'
import type { Battle } from './scenes/Battle'

/** 真机压力测试：构建时设 `VITE_START_WAVE=15`，开局直接放下三个英雄、从这一波开始（看后期怪最多时的性能）。 */
const START_WAVE = Number(import.meta.env.VITE_START_WAVE ?? 0)

// 小游戏构建是 CommonJS，不能用顶层 await
void startGame(gameOptions).then((game) => {
  if (START_WAVE > 0) {
    const b = game.tree.currentScene as Battle
    b.startWith('knight')
    b.placeHero('mage')
    b.placeHero('archer')
    b.gainXp(400) // 先攒几级，开局就有三选一
    b.startWave(START_WAVE)
    console.log(`[stress] start at wave ${START_WAVE}`)
  }
  if (import.meta.env.VITE_DEBUG_TOUCH) debugTouch(game.tree.currentScene as Battle)
  // 每 5 秒打印一次帧耗时和场面（构建时设置 SAPLING_LOG_URL 就能在电脑上看到真机的数字）
  setInterval(() => {
    const s = game.frameStats
    if (s.frames === 0) return
    const f = (x: number) => x.toFixed(2)
    const b = game.tree.currentScene as Battle
    const alive = b.enemies?.filter((e) => !e.dead).length ?? 0
    console.log(
      `[perf] wave ${b.wave} enemies ${alive} state ${b.state} | fps ${s.fps.toFixed(1)} interval max ${f(s.intervalMax)} | logic ${f(s.logicAvg)} max ${f(s.logicMax)} | render ${f(s.renderAvg)} max ${f(s.renderMax)} ms`,
    )
    game.resetFrameStats()
  }, 5000)
})

/** 调试真机触摸（`VITE_DEBUG_TOUCH=1`）：原始触摸坐标、大招按钮收到的事件和状态、大招栏的信号。 */
function debugTouch(b: Battle) {
  const wxApi = (globalThis as unknown as { wx: { onTouchStart(f: (e: { touches: { clientX: number; clientY: number }[] }) => void): void; onTouchEnd(f: (e: { changedTouches: { clientX: number; clientY: number }[] }) => void): void } }).wx
  const r = (n: number) => Math.round(n)
  wxApi.onTouchStart((e) => console.log(`[touch] start ${e.touches.map((t) => `${r(t.clientX)},${r(t.clientY)}`).join(' ')}`))
  wxApi.onTouchEnd((e) => console.log(`[touch] end ${e.changedTouches.map((t) => `${r(t.clientX)},${r(t.clientY)}`).join(' ')}`))
  const bar = b.ultBar
  for (const kind of ['archer', 'mage', 'knight'] as const) {
    const btn = bar.buttons[kind]
    const state = () => `charged=${btn.charged} aiming=${bar.aiming} waiting=${bar.waiting} energy=${Math.round(b.energy[kind])} canUlt=${b.canUlt(kind)}`
    btn.pointerDown.connect((e) => console.log(`[touch] ${kind} down at ${r(e.position.x)},${r(e.position.y)} btn ${r(btn.x)},${r(btn.y)} ${state()}`))
    btn.pointerUp.connect((e) => console.log(`[touch] ${kind} up at ${r(e.position.x)},${r(e.position.y)} ${state()}`))
  }
  bar.catcher.pointerDown.connect((e) => console.log(`[touch] catcher down ${r(e.position.x)},${r(e.position.y)} aiming=${bar.aiming}`))
  bar.aimStart.connect((k) => console.log(`[touch] aimStart ${k}`))
  bar.aimWait.connect((k) => console.log(`[touch] aimWait ${k}`))
  bar.aimEnd.connect((k, at) => console.log(`[touch] aimEnd ${k} ${at ? `${r(at.x)},${r(at.y)}` : 'cancel'}`))
  const vp = b.tree.viewport
  console.log(`[touch] visible ${JSON.stringify(vp.visibleRect)} safe ${JSON.stringify(vp.safeRect)}`)
}
