import { key } from 'sapling2d'
import { Battle } from './scenes/Battle'

declare module 'sapling2d' {
  interface ActionRegistry {
    confirm: true
  }
  interface StorageRegistry {
    /** 到过的最高波次、胜利次数。 */
    bestWave: number
    wins: number
    /** 设置：关掉音乐 / 音效（HUD 右上角的开关）。 */
    musicMuted: boolean
    sfxMuted: boolean
  }
}

/** 浏览器和小游戏共用的启动参数：竖屏 750×1334（默认）。 */
export const gameOptions = {
  main: Battle,
  /** 背景图底边（城墙下的草地）的颜色：屏幕比背景图长时补在底下。 */
  background: 0x4d6d41,
  actions: {
    /** 结束画面：按空格 / 回车再来一局（手机上点“再来一局”按钮）。 */
    confirm: [key('Space'), key('Enter')],
  },
}
