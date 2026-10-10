import { atlas, tex } from 'sapling2d'
import heroesData from '../public/assets/heroes.json'

/**
 * 所有资源（Battle 场景进场前加载）。
 * - 图集由美术管线生成（`pnpm art`，见 scripts/art/README.md）：精灵按显示尺寸的 2 倍存，游戏里用 `ART_SCALE` 缩小；
 * - 其余是占位图（scripts/gen-placeholders.mjs），美术到位后逐步换成图集。
 */
export const ASSETS = {
  /** 英雄：`<hero>_body`（锚点在脚底）和 `<hero>_weapon`（锚点在握持处）。 */
  heroes: atlas('heroes.png', heroesData),
  slime: tex('slime.png'),
  slot: tex('slot.png'),
  arrow: tex('arrow.png'),
  glow: tex('glow.png'),
  spark: tex('spark.png'),
  dot: tex('dot.png'),
  range: tex('range.png'),
  slash: tex('slash.png'),
}

/** 图集里的精灵是显示尺寸的 2 倍（高分屏清晰），显示时乘这个缩放。 */
export const ART_SCALE = 0.5
