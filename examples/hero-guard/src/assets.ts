import { atlas, tex } from 'sapling2d'
import enemiesData from '../public/assets/enemies.json'
import fxData from '../public/assets/fx.json'
import heroesData from '../public/assets/heroes.json'
import uiData from '../public/assets/ui.json'

/**
 * 所有资源（Battle 场景进场前加载）。
 * - 图集由美术管线生成（`pnpm art`，见 scripts/art/README.md）：精灵按显示尺寸的 2 倍存，游戏里用 `ART_SCALE` 缩小；
 * - 背景单独一张 jpg（750×1344 的 2 倍）；
 * - 其余是占位图（scripts/gen-placeholders.mjs）：光晕、火花、圆圈、槽位这类简单形状，留着用。
 */
export const ASSETS = {
  /** 英雄：`<hero>_body`（锚点在脚底）和 `<hero>_weapon`（锚点在握持处）。 */
  heroes: atlas('heroes.png', heroesData),
  /** 怪物和 Boss：`enemy_<kind>`（锚点在脚底）。小史莱姆用 `enemy_slime` 缩小。 */
  enemies: atlas('enemies.png', enemiesData),
  /**
   * 特效：`fx_slash`、`fx_fireball`、`fx_ice`、`fx_lightning`、`fx_poison`、`fx_explosion` 是黑底的，必须叠加发光（`blendMode: 'add'`，
   * 放进 Battle 的 `fx` 层就行）；`fx_arrow` 是透明底、朝上。
   */
  fx: atlas('fx.png', fxData),
  /** 界面：`ui_panel`（九宫格木框）、`ui_button`（九宫格按钮）、`icon_<hero>_<branch>`、`icon_generic_<effect>`、`icon_ult_<hero>`。 */
  ui: atlas('ui.png', uiData),
  bg: tex('bg.jpg'),
  /** 英雄阵亡的墓碑（占位，底边是脚底；美术管线的 `tombstone` 生成后换掉）。 */
  tombstone: tex('tombstone.png'),
  glow: tex('glow.png'),
  spark: tex('spark.png'),
  dot: tex('dot.png'),
  range: tex('range.png'),
}

/** 图集里的精灵是显示尺寸的 2 倍（高分屏清晰），显示时乘这个缩放。 */
export const ART_SCALE = 0.5
