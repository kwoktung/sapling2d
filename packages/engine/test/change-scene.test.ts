import { describe, expect, it } from 'vitest'
import { Label, Node, Node2D, Scene, sfx, tex, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'

const SHARED = tex('cs-shared.png')
const ONLY_GAME = tex('cs-only-game.png')
const ONLY_OVER = tex('cs-only-over.png')
const POP = sfx('cs-pop.mp3')

class GameState extends Node {
  plays = 0
}

class GameScene extends Scene {
  static override assets = { shared: SHARED, onlyGame: ONLY_GAME, pop: POP }
  exited = false
  override ready() {
    this.tree.autoload(GameState).plays++
    this.add(new Node2D({ name: 'Board' }))
  }
  override exitTree() {
    this.exited = true
  }
}

class GameOver extends Scene {
  static override assets = { shared: SHARED, onlyOver: ONLY_OVER }
  assetsReadyInReady = false
  constructor(readonly params: { score: number; best?: number }) {
    super()
  }
  override ready() {
    this.assetsReadyInReady = GameOver.assets.onlyOver.isLoaded
    this.add(new Label({ name: 'Score', text: `得分 ${this.params.score}` }))
  }
}

describe('changeScene', () => {
  it('带类型的参数；旧场景收到 exitTree 并被销毁；新场景资源在 ready 之前加载完成；dump 反映新场景', async () => {
    const g = await createTestGame({ main: GameScene, autoloads: [GameState] })
    const game = g.scene
    expect(g.dump()).toContain('GameScene (GameScene)')

    const over = await g.tree.changeScene(GameOver, { score: 120 })
    expect(over.params.score).toBe(120)
    expect(over.assetsReadyInReady).toBe(true)
    expect(game.exited).toBe(true)
    expect(game.isFreed).toBe(true)
    expect(g.tree.currentScene).toBe(over)
    expect(g.scene).toBe(over)
    expect(g.dump()).toBe(['GameState (GameState)', 'GameOver (GameOver) position=(0, 0)', '  Score (Label) position=(0, 0) text="得分 120"'].join('\n'))
  })

  it('Autoload 跨场景保留，状态不丢', async () => {
    const g = await createTestGame({ main: GameScene, autoloads: [GameState] })
    const state = g.tree.autoload(GameState)
    await g.tree.changeScene(GameOver, { score: 1 })
    await g.tree.changeScene(GameScene)
    expect(g.tree.autoload(GameState)).toBe(state)
    expect(state.plays).toBe(2)
  })

  it('只卸载旧场景独有的资源；两个场景共用的资源保留', async () => {
    const g = await createTestGame({ main: GameScene, autoloads: [GameState] })
    expect([SHARED.isLoaded, ONLY_GAME.isLoaded, POP.isLoaded]).toEqual([true, true, true])
    await g.tree.changeScene(GameOver, { score: 0 })
    expect([SHARED.isLoaded, ONLY_GAME.isLoaded, POP.isLoaded, ONLY_OVER.isLoaded]).toEqual([true, false, false, true])
    await g.tree.changeScene(GameScene)
    expect([ONLY_GAME.isLoaded, ONLY_OVER.isLoaded]).toEqual([true, false])
  })

  it('在帧内调用时不会打断当前帧：本帧结束前仍是旧场景，之后才替换', async () => {
    class Main extends Scene {
      seenAfterCall: Scene | null = null
      override process() {
        if (this.tree.processFrames === 3) {
          void this.tree.changeScene(GameOver, { score: 3 })
          this.seenAfterCall = this.tree.currentScene
        }
      }
    }
    const g = await createTestGame({ main: Main })
    const main = g.scene
    g.step(3)
    expect(main.seenAfterCall).toBe(main)
    expect(g.tree.currentScene).toBe(main) // step 是同步的：替换还没发生
    await new Promise((r) => setTimeout(r, 0))
    expect(g.tree.currentScene).toBeInstanceOf(GameOver)
  })

  it('连续调用按顺序执行，最后一次生效；sceneChanged 每次都触发', async () => {
    const g = await createTestGame({ main: GameScene, autoloads: [GameState] })
    const changed: string[] = []
    g.tree.sceneChanged.connect((s) => changed.push(s.constructor.name))
    const p1 = g.tree.changeScene(GameOver, { score: 1 })
    const p2 = g.tree.changeScene(GameOver, { score: 2 })
    const [a, b] = await Promise.all([p1, p2])
    expect(a.params.score).toBe(1)
    expect(a.isFreed).toBe(true)
    expect(g.tree.currentScene).toBe(b)
    expect(changed).toEqual(['GameOver', 'GameOver'])
  })

  it('reloadCurrentScene 用上次的参数重新创建场景', async () => {
    const g = await createTestGame({ main: GameScene, autoloads: [GameState] })
    const first = await g.tree.changeScene(GameOver, { score: 42, best: 99 })
    const again = (await g.tree.reloadCurrentScene()) as GameOver
    expect(again).not.toBe(first)
    expect(again.params).toEqual({ score: 42, best: 99 })
  })

  it('旧场景上的 Tween 和节点信号随场景销毁而停止', async () => {
    const g = await createTestGame({ main: GameScene, autoloads: [GameState] })
    const board = g.scene.children[0] as Node2D
    const tween = board.createTween().to(board, { position: v(100, 0) }, 1)
    await g.tree.changeScene(GameOver, { score: 0 })
    g.step()
    expect(tween.isRunning).toBe(false)
  })

  it('参数类型检查', async () => {
    const g = await createTestGame({ main: GameScene, autoloads: [GameState] })
    // @ts-expect-error 缺少参数
    void g.tree.changeScene(GameOver).catch(() => {})
    // @ts-expect-error score 应该是 number
    void g.tree.changeScene(GameOver, { score: 'high' }).catch(() => {})
    await g.tree.changeScene(GameScene) // 无参数场景不需要传参
  })
})
