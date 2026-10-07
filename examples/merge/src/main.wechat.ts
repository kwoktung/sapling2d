import { snapshot, startGame } from 'sapling2d/wechat'
import { gameOptions } from './game'
import { GameOverScene } from './GameOverScene'

declare const GameGlobal: Record<string, unknown>

void startGame(gameOptions).then((game) => {
  // 真机调试：只有构建时设置了 SAPLING_LOG_URL（日志会发到电脑上）才启用
  if (!GameGlobal.__saplingLog) return
  const tree = game.tree
  const platform = game.platform as { audio?: { unlocked?: boolean } }
  console.log(`[merge] start best=${tree.storage.get('best', 0)} muted=${tree.storage.get('musicMuted', false)} screen=${JSON.stringify(tree.viewport.screen)}`)
  tree.focusChanged.connect((focused) => console.log(`[merge] focus ${focused}`))
  tree.sceneChanged.connect((scene) => {
    console.log(`[merge] scene ${scene.constructor.name}`)
    if (scene instanceof GameOverScene) tree.createTimer(0.5).timeout.connect(() => snapshot('gameover'))
  })

  // Autoload 之外的调试节点挂在根上：用一个跨场景的计时器
  let lastFrames = tree.processFrames
  let lastTime = Date.now()
  let n = 0
  const tick = () => {
    const now = Date.now()
    const fps = Math.round(((tree.processFrames - lastFrames) * 1000) / Math.max(1, now - lastTime))
    lastFrames = tree.processFrames
    lastTime = now
    const scene = tree.currentScene as { score?: number } | null
    console.log(`[merge] fps=${fps} fruits=${tree.getNodesInGroup('fruits').length} score=${scene?.score ?? '-'} audio=${platform.audio?.unlocked ? 'on' : 'locked'}`)
    if (++n % 3 === 0) snapshot(`play-${n}`)
    tree.createTimer(3).timeout.connect(tick)
  }
  tree.createTimer(3).timeout.connect(tick)
})
