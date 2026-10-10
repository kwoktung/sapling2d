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
  background: 0x2f4a2a,
  actions: {
    /** 胜负画面：点屏幕或按空格再来一局。 */
    confirm: [pointerPress(), key('Space'), key('Enter')],
  },
}
