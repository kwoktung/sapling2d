import { Particles2D, type Game, v } from 'sapling2d'
import { ASSETS } from './assets'
import { Enemy } from './nodes/Enemy'
import { Knife } from './nodes/Knife'
import { Arena } from './scenes/Arena'

/**
 * 真机性能测试（`VITE_BENCH=1` 构建）：依次跑几个场景，每个热身 3 秒、测 12 秒，把 frameStats 打到日志里（`[bench] …`）。
 * 所有角色都不会死（血量很大），场景里的负载一直保持；玩家不动，敌人照常追过来打。
 */
interface Scenario {
  name: string
  /** 场上的敌人总数和每个敌人的刀数（不设就用关卡原样）。 */
  enemies?: number
  knivesEach?: number
  playerKnives?: number
  /** 加一个持续发射、维持这么多粒子的发射器。 */
  particles?: number
}

const SCENARIOS: Scenario[] = [
  { name: 'level' },
  { name: 'target-150-knives-20-enemies', enemies: 20, knivesEach: 6, playerKnives: 12 },
  { name: 'stress-500-knives', enemies: 20, knivesEach: 24, playerKnives: 20 },
  { name: 'particles-500', particles: 500 },
]
const WARMUP = 3
const MEASURE = 12

const wait = (game: Game, seconds: number) => game.tree.createTimer(seconds, { ignoreTimeScale: true }).timeout.wait()

export async function runBench(game: Game): Promise<void> {
  const tree = game.tree
  for (const s of SCENARIOS) {
    await tree.changeScene(Arena)
    const arena = tree.currentScene as Arena
    setup(arena, s)
    await wait(game, WARMUP)
    game.resetFrameStats()
    await wait(game, MEASURE)
    const f = game.frameStats
    const knives = arena.children.filter((n) => n instanceof Knife).length
    const fx = (x: number) => x.toFixed(2)
    console.log(
      `[bench] ${s.name} | fighters ${arena.fighters.length} knives ${knives} | fps ${f.fps.toFixed(1)} interval max ${fx(f.intervalMax)} | logic ${fx(f.logicAvg)} max ${fx(f.logicMax)} | render ${fx(f.renderAvg)} max ${fx(f.renderMax)} ms`,
    )
  }
  console.log('[bench] done')
}

function setup(arena: Arena, s: Scenario): void {
  const p = arena.player
  p.hp = 1e9
  if (s.playerKnives) arena.giveKnives(p, s.playerKnives - p.knives.length)
  if (s.enemies) {
    // 原有的敌人换成指定刀数；再在玩家周围补到 enemies 个
    const rng = arena.tree.rng
    while (arena.enemies.length < s.enemies) {
      const a = rng.randfRange(0, Math.PI * 2)
      const d = rng.randfRange(350, 900)
      const x = p.x + Math.cos(a) * d
      const y = p.y + Math.sin(a) * d
      if (arena.isSolid(x, y) || arena.isSolid(x - 40, y - 40) || arena.isSolid(x + 40, y + 40)) continue
      arena.spawnEnemy(new Enemy(arena, x, y), 0)
    }
    for (const e of arena.enemies) arena.giveKnives(e, Math.max(0, (s.knivesEach ?? 0) - e.knives.length))
  }
  for (const e of arena.enemies) e.hp = 1e9
  if (s.particles) {
    arena.add(
      new Particles2D({ name: 'BenchParticles', texture: ASSETS.spark, position: v(p.x, p.y - 200), amount: s.particles, lifetime: 1.2, speedMin: 60, speedMax: 400, damping: 1, scaleStart: 1.5, scaleEnd: 0.3, alphaEnd: 0, selfModulate: 0x80c0ff }),
    )
  }
}
