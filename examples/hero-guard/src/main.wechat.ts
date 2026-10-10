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
