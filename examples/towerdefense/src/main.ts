import { startGame } from 'sapling2d/browser'
import { gameOptions } from './game'
import { Battle } from './scenes/Battle'

const game = await startGame(gameOptions)
Object.assign(globalThis, { sapling: game }) // 在浏览器控制台里：sapling.tree.dump()

// 压力测试：?stress=60 放满英雄、同屏 60 只怪，每 5 秒打印一次帧耗时
const stress = Number(new URLSearchParams(location.search).get('stress') ?? 0)
if (stress > 0) {
  const scene = game.tree.currentScene
  if (scene instanceof Battle) scene.stress(stress)
  setInterval(() => {
    const s = game.frameStats
    if (s.frames === 0) return
    console.log(`[perf] fps ${s.fps.toFixed(1)} | logic ${s.logicAvg.toFixed(2)} max ${s.logicMax.toFixed(2)} | render ${s.renderAvg.toFixed(2)} max ${s.renderMax.toFixed(2)} ms`)
    game.resetFrameStats()
  }, 5000)
}
