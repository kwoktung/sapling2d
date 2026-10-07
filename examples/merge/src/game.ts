import { key, pointerPress } from 'sapling2d'
import { GameScene } from './GameScene'

/** 浏览器和小游戏共用的启动参数 */
export const gameOptions = {
  main: GameScene,
  background: 0xffe8b0,
  storagePrefix: 'merge:',
  // aim：按住屏幕瞄准，松手投放（被按钮等节点处理掉的按下不算）；drop：键盘空格直接投放
  actions: { aim: [pointerPress()], drop: [key('Space')] },
}
