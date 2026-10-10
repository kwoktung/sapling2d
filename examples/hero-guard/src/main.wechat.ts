import { startGame } from 'sapling2d/wechat'
import { gameOptions } from './game'

// 小游戏构建是 CommonJS，不能用顶层 await
void startGame(gameOptions).then((game) => {
  // 每 5 秒打印一次帧耗时（构建时设置 SAPLING_LOG_URL 就能在电脑上看到真机的数字）
  setInterval(() => {
    const s = game.frameStats
    if (s.frames === 0) return
    const f = (x: number) => x.toFixed(2)
    console.log(`[perf] fps ${s.fps.toFixed(1)} interval max ${f(s.intervalMax)} | logic ${f(s.logicAvg)} max ${f(s.logicMax)} | render ${f(s.renderAvg)} max ${f(s.renderMax)} ms`)
    game.resetFrameStats()
  }, 5000)
})
