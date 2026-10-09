import { key } from 'sapling2d'
import { Arena } from './scenes/Arena'

declare module 'sapling2d' {
  interface ActionRegistry {
    left: true
    right: true
    up: true
    down: true
  }
}

/** 浏览器和小游戏共用的启动参数：竖屏 750×1334（默认）。 */
export const gameOptions = {
  main: Arena,
  background: 0x2b2420,
  actions: {
    left: [key('ArrowLeft'), key('KeyA')],
    right: [key('ArrowRight'), key('KeyD')],
    up: [key('ArrowUp'), key('KeyW')],
    down: [key('ArrowDown'), key('KeyS')],
  },
}
