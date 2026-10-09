import { key } from 'sapling2d'
import { Level } from './scenes/Level'
import { GameState } from './state'

declare module 'sapling2d' {
  interface ActionRegistry {
    left: true
    right: true
    jump: true
  }
}

/** 浏览器和小游戏共用的启动参数：横屏 480×272（一屏 17 格高），像素风。 */
export const gameOptions = {
  main: Level,
  autoloads: [GameState],
  design: { width: 480, height: 272 },
  pixelArt: true,
  background: 0x5c94fc,
  actions: {
    left: [key('ArrowLeft'), key('KeyA')],
    right: [key('ArrowRight'), key('KeyD')],
    jump: [key('Space'), key('ArrowUp'), key('KeyW'), key('KeyK')],
  },
}
