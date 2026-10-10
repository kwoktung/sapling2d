import { startGame } from 'sapling2d/wechat'
import { gameOptions } from './game'
import { Battle } from './scenes/Battle'

// 小游戏构建是 CommonJS，不能用顶层 await
void startGame(gameOptions).then((game) => {
  // 压力测试构建（VITE_STRESS=60）：放满英雄、同屏 N 只怪
  const stress = Number(import.meta.env.VITE_STRESS ?? 0)
  const scene = game.tree.currentScene
  if (stress > 0 && scene instanceof Battle) scene.stress(stress)
  // 每 5 秒打印一次帧耗时（构建时设置 SAPLING_LOG_URL 就能在电脑上看到真机的数字）
  setInterval(() => {
    const s = game.frameStats
    if (s.frames === 0) return
    const f = (x: number) => x.toFixed(2)
    console.log(`[perf] fps ${s.fps.toFixed(1)} interval max ${f(s.intervalMax)} | logic ${f(s.logicAvg)} max ${f(s.logicMax)} | render ${f(s.renderAvg)} max ${f(s.renderMax)} ms`)
    game.resetFrameStats()
  }, 5000)
})
