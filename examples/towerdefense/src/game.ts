import { key, pointerPress } from 'sapling2d'
import { Battle } from './scenes/Battle'

declare module 'sapling2d' {
  interface ActionRegistry {
    confirm: true
  }
}

/** 浏览器和小游戏共用的启动参数：竖屏 750×1334（默认）。 */
export const gameOptions = {
  main: Battle,
  background: 0x1c2620,
  actions: {
    /** 失败后点屏幕或按空格重来。 */
    confirm: [pointerPress(), key('Space'), key('Enter')],
  },
}
