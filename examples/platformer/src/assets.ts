import { sheet, tex, tiledMap } from 'sapling2d'

/** 所有资源：关卡、角色图集、按钮。场景的 static assets 用它，进入场景前全部加载。 */
export const ASSETS = {
  level: tiledMap('levels/1-1.json'),
  mario: sheet('mario.png', { columns: 5, rows: 1 }),
  goomba: sheet('goomba.png', { columns: 3, rows: 1 }),
  coin: sheet('coin.png', { columns: 4, rows: 1 }),
  btnLeft: tex('btn-left.png'),
  btnRight: tex('btn-right.png'),
  btnJump: tex('btn-jump.png'),
}
