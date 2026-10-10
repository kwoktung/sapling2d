/**
 * 素材清单：每个素材怎么生成、抠图、缩放、打进哪张图集。`pnpm art` 按它跑管线（scripts/art/）。
 * 路径都相对 `art/`。纯数据，不依赖引擎。
 */

export interface AssetSpec {
  /** 素材名：原图 `raw/<id>.*`、精灵 `sprites/<id>.png`、图集里的帧名。 */
  id: string
  /**
   * `generate`：按 `prompt` + 风格模板生成（有风格锚点时附上锚点图）；
   * `edit`：基于 `refs` 里的图编辑（例如“同一个角色，不拿武器”），不附风格模板。
   */
  mode: 'generate' | 'edit'
  prompt: string
  /** 参考图（相对 art/，如 `raw/archer_full.jpg`）。 */
  refs?: string[]
  /** 纯色背景，抠图时去掉。默认品红 #FF00FF；素材本身有品红 / 紫色时换成绿色 #00FF00 等。 */
  background?: string
  /** 游戏里显示的高度（像素）；精灵按 2 倍存。 */
  displayHeight: number
  /** 打进哪张图集（`public/assets/<atlas>.png`）。 */
  atlas: string
  /** 锚点（0–1，相对抠图裁边后的图）：身体放脚底 (0.5, 1)，武器放握持点。不设就是中心。 */
  pivot?: { x: number; y: number }
}

/** 风格锚点（相对 art/）：生成模式的素材都附上它，保证风格统一。03 选定后填写；null 表示还没有。 */
export const STYLE_ANCHOR: string | null = null

export const ASSETS: AssetSpec[] = [
  // 管线测试用的弓手（02）：原图来自风格对比时生成的那张；03 换成正式的英雄
  {
    id: 'archer_test',
    mode: 'generate',
    prompt:
      'A female archer hero: green hooded cloak, brown leather armor, wooden longbow in her left hand, quiver on her back. Standing pose.',
    displayHeight: 140,
    atlas: 'heroes',
    pivot: { x: 0.5, y: 1 },
  },
]
