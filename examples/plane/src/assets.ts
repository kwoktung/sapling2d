import { atlas, music, sfx, sheet, tex } from 'sapling2d'
import spritesData from './sprites.json'

/** 所有场景共用的资源：每个场景的 static assets 都声明它，切换场景时不会被卸载重载。 */
export const ASSETS = {
  sprites: atlas('sprites.png', spritesData), // 战机、子弹、道具、按钮（scripts/gen-assets.mjs 生成）
  explosion: sheet('explosion.png', { columns: 4, rows: 2 }),
  background: tex('background.png'),
  shoot: sfx('sfx/shoot.mp3'),
  explode: sfx('sfx/explode.mp3'),
  hit: sfx('sfx/hit.mp3'),
  powerup: sfx('sfx/powerup.mp3'),
  gameover: sfx('sfx/gameover.mp3'),
  bgm: music('bgm.mp3'),
}
