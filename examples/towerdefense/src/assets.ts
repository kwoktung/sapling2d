import { sheet, tex } from 'sapling2d'

/** 所有资源（Battle 场景进场前加载）。英雄图是 6 帧横条：0–1 待机，2–5 攻击。 */
export const ASSETS = {
  archer: sheet('hero_archer.png', { columns: 6, rows: 1 }),
  mage: sheet('hero_mage.png', { columns: 6, rows: 1 }),
  knight: sheet('hero_knight.png', { columns: 6, rows: 1 }),
  enemy: tex('enemy.png'),
  /** 怪物的白色剪影：受击闪白（引擎的 modulate 只能变暗，不能变亮）。 */
  enemyFlash: tex('enemy_flash.png'),
  slot: tex('slot.png'),
  arrow: tex('arrow.png'),
  glow: tex('glow.png'),
  spark: tex('spark.png'),
  range: tex('range.png'),
  slash: tex('slash.png'),
}
