import { key, pointerPress } from 'sapling2d'
import { TitleScene } from './scenes/TitleScene'

declare module 'sapling2d' {
  interface ActionRegistry {
    start: true
    left: true
    right: true
    up: true
    down: true
    pause: true
  }
  interface StorageRegistry {
    best: number
  }
}

/** 浏览器和小游戏共用的启动参数 */
export const gameOptions = {
  main: TitleScene,
  background: 0x080a20,
  actions: {
    start: [pointerPress(), key('Space'), key('Enter')],
    left: [key('ArrowLeft'), key('KeyA')],
    right: [key('ArrowRight'), key('KeyD')],
    up: [key('ArrowUp'), key('KeyW')],
    down: [key('ArrowDown'), key('KeyS')],
    pause: [key('KeyP'), key('Escape')],
  },
}
