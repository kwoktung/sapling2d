import { startGame } from 'sapling2d/wechat'
import { runBench } from './bench'
import { runVerify } from './verify'
import { gameOptions } from './game'

// 小游戏构建是 CommonJS，不能用顶层 await
void startGame(gameOptions).then((game) => {
  // 真机压力测试构建（VITE_BENCH=1）：自己跑三个阶段、打印结果
  if (import.meta.env.VITE_BENCH === '1') {
    void runBench(game)
    return
  }
  // 真机效果检查构建（VITE_VERIFY=1）：摆好闪白和叠加发光的画面，截图发到 log server
  if (import.meta.env.VITE_VERIFY === '1') {
    void runVerify(game)
    return
  }
  // 每 5 秒打印一次帧耗时（构建时设置 SAPLING_LOG_URL 就能在电脑上看到真机的数字）
  setInterval(() => {
    const s = game.frameStats
    if (s.frames === 0) return
    const f = (x: number) => x.toFixed(2)
    console.log(`[perf] fps ${s.fps.toFixed(1)} interval max ${f(s.intervalMax)} | logic ${f(s.logicAvg)} max ${f(s.logicMax)} | render ${f(s.renderAvg)} max ${f(s.renderMax)} ms`)
    game.resetFrameStats()
  }, 5000)
})
