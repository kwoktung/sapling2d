import { tex } from 'sapling2d'

/** 所有资源（Battle 场景进场前加载）。骨架阶段是占位图（scripts/gen-placeholders.mjs），美术到位后换成图集。 */
export const ASSETS = {
  archerBody: tex('hero_archer_body.png'),
  archerWeapon: tex('hero_archer_weapon.png'),
  mageBody: tex('hero_mage_body.png'),
  mageWeapon: tex('hero_mage_weapon.png'),
  knightBody: tex('hero_knight_body.png'),
  knightWeapon: tex('hero_knight_weapon.png'),
  slime: tex('slime.png'),
  slot: tex('slot.png'),
  arrow: tex('arrow.png'),
  glow: tex('glow.png'),
  spark: tex('spark.png'),
  dot: tex('dot.png'),
  range: tex('range.png'),
}
