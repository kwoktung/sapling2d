import { Timer } from 'sapling2d'
import { snapshot, startGame } from 'sapling2d/wechat'
import { gameOptions } from './game'

void startGame(gameOptions).then((game) => {
  console.log('[sapling2d] started', JSON.stringify(game.tree.viewport.screen))

  // 调试（构建时设置了 SAPLING_LOG_URL 才会发到电脑上）：
  // 第 2、4 秒各截一张图（确认画面在动）；之后每当触摸改变了游戏状态，就记录一次状态并截图
  game.tree.createTimer(2).timeout.connect(() => snapshot('start-2s'))
  game.tree.createTimer(4).timeout.connect(() => snapshot('start-4s'))
  const scene = game.scene
  let last = ''
  let n = 0
  const watch = scene.add(new Timer({ name: 'DebugWatch', waitTime: 1, autostart: true }))
  watch.timeout.connect(() => {
    const spinner = scene.children.find((c) => c.name === 'Spinner') as { speed?: number } | undefined
    const spawned = scene.children.filter((c) => c.name.startsWith('Spawned')).length
    const row = scene.children.find((c) => c.name === 'Row')
    const balls = row?.children.map((c) => (c as unknown as { position: { toString(): string } }).position.toString()).join(' ')
    const state = `spinner=${(spinner?.speed ?? 0) > 0 ? 'cw' : 'ccw'} spawned=${spawned} row=${balls}`
    if (state !== last) {
      if (last) {
        console.log(`[sapling2d] state ${state}`)
        snapshot(`touch-${++n}`)
      }
      last = state
    }
  })
})
