import { tex, tiledMap } from 'sapling2d'

/** 所有资源：关卡、角色、刀。场景的 static assets 用它，进入场景前全部加载。 */
export const ASSETS = {
  level: tiledMap('levels/arena.json'),
  player: tex('player.png'),
  enemy: tex('enemy.png'),
  knife: tex('knife.png'),
  stickBase: tex('stick-base.png'),
  stickKnob: tex('stick-knob.png'),
}
