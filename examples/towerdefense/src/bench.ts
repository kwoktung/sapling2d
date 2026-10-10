import type { Game } from 'sapling2d'
import { Battle } from './scenes/Battle'
import { HERO_KINDS } from './skills'

const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000))

/**
 * 真机压力测试（VITE_BENCH=1）：放满 12 个英雄、60 只怪（走到底线回到起点），依次跑三个阶段，每个阶段热身 3 秒、测 10 秒，
 * 打印 `[bench]` 一行：
 * 1. normal：正常攻速（每秒十几个飘字）；
 * 2. fast：攻速调到 0.15 秒（每秒约 50 个飘字，数字大多相同，Label 不用重新画）；
 * 3. fast-vary：同上，但每个数字都不同（每个飘字都要重新栅格化文字）——和 2 对比就是 Label 的代价。
 */
export async function runBench(game: Game): Promise<void> {
  const battle = game.tree.currentScene
  if (!(battle instanceof Battle)) return
  battle.stress(60)
  let floats = 0
  const plain = battle.formatDamage
  const count = (fmt: (n: number) => string) => (n: number) => {
    floats++
    return fmt(n)
  }
  const phases: [string, () => void][] = [
    ['normal', () => (battle.formatDamage = count(plain))],
    [
      'fast',
      () => {
        for (const k of HERO_KINDS) battle.stats[k].interval = 0.15
        battle.formatDamage = count(plain)
      },
    ],
    ['fast-vary', () => (battle.formatDamage = count(() => String(battle.tree.rng.randiRange(100, 999))))],
  ]
  await wait(2)
  for (const [name, setup] of phases) {
    setup()
    await wait(3)
    game.resetFrameStats()
    floats = 0
    await wait(10)
    const s = game.frameStats
    const f = (x: number) => x.toFixed(2)
    console.log(
      `[bench] ${name}: fps ${s.fps.toFixed(1)} interval max ${f(s.intervalMax)} | logic ${f(s.logicAvg)} max ${f(s.logicMax)} | render ${f(s.renderAvg)} max ${f(s.renderMax)} ms | floats/s ${(floats / 10).toFixed(0)} | enemies ${battle.enemies.length}`,
    )
  }
  console.log('[bench] done')
}
