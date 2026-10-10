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
  /** 打进哪张图集（`public/assets/<atlas>.png`）；不写就不打包（例如挑选用的候选图）。 */
  atlas?: string
  /** 锚点（0–1，相对抠图裁边后的图）：身体放脚底 (0.5, 1)，武器放握持点。不设就是中心。 */
  pivot?: { x: number; y: number }
}

/** 风格锚点（相对 art/）：生成模式的素材都附上它，保证风格统一。03 从候选里选定的弓手（refs/ 进 git）。 */
export const STYLE_ANCHOR: string | null = 'refs/archer_full.jpg'

const HEROES = {
  archer:
    'A young female archer hero: green hooded cloak, brown leather armor, wooden longbow held in her left hand slightly away from her body (the bow must not overlap her body), quiver of arrows on her back. Confident friendly expression, standing pose.',
  mage:
    'A young male mage hero: purple robe with golden trim, tall pointed purple wizard hat, wooden staff topped with a glowing orange orb held in his right hand slightly away from his body (the staff must not overlap his body). Cheerful expression, standing pose.',
  knight:
    'A young male knight hero: blue and silver plate armor, short blue cape, round shield strapped on his back, steel longsword held upright in his right hand slightly away from his body (the sword must not overlap his body). Brave expression, standing pose.',
}

/**
 * 03：每个英雄的身体 + 武器，都从 `refs/<hero>_full.jpg`（3 张候选里挑出来的完整角色图，进 git）编辑出来。
 * 身体：同一个角色，手里没有武器（武器在游戏里单独挥动）。武器：单独画出来，竖直摆放，锚点在握持处（挥动时绕着它转）。
 */
const WEAPON: Record<keyof typeof HEROES, { name: string; hand: string; upright: string; grip: { x: number; y: number }; height: number }> = {
  archer: { name: 'wooden longbow', hand: 'left', upright: 'standing vertically, the string on the left side', grip: { x: 0.5, y: 0.5 }, height: 100 },
  mage: { name: 'wooden staff with the glowing orange orb', hand: 'right', upright: 'standing vertically, the orb at the top', grip: { x: 0.5, y: 0.62 }, height: 130 },
  knight: { name: 'steel longsword', hand: 'right', upright: 'standing vertically, blade pointing up and the hilt at the bottom', grip: { x: 0.5, y: 0.86 }, height: 100 },
}

const HERO_PARTS: AssetSpec[] = (['archer', 'mage', 'knight'] as const).flatMap((hero) => {
  const w = WEAPON[hero]
  const refs = [`refs/${hero}_full.jpg`]
  // 弓贴着身体，用完整角色图当参考时模型总会把人也画出来：改用只裁出弓的那一块（refs/archer_bow_crop.jpg）
  const weaponRefs = hero === 'archer' ? ['refs/archer_bow_crop.jpg'] : refs
  return [
    {
      id: `${hero}_body`,
      mode: 'edit' as const,
      prompt: `Edit this image: remove the ${w.name} completely. The character's ${w.hand} hand is now empty, held in a relaxed loose fist at the same place, as if about to grip something. Keep everything else exactly the same: same character, same pose, same clothes and colors.`,
      refs,
      displayHeight: 140,
      atlas: 'heroes',
      pivot: { x: 0.5, y: 1 },
      ...(hero === 'mage' ? { background: '#00FF00' } : {}),
    },
    {
      id: `${hero}_weapon`,
      mode: 'edit' as const,
      // 只说“画出武器”时模型常常把整个角色再画一遍：明确“输出里没有人”。发光效果由游戏叠加，素材里不要画光晕
      prompt: `Create an isolated object illustration of the ${w.name} shown in the reference image: draw ONLY that single object, complete and symmetric, ${w.upright}, centered. The output image must contain NO person, NO character, NO hands, NO arrows, NO glow or light rays — just the bare object. Same design, colors and outline style as in the reference image.`,
      refs: weaponRefs,
      displayHeight: w.height,
      atlas: 'heroes',
      pivot: w.grip,
    },
  ]
})

export const ASSETS: AssetSpec[] = [
  ...HERO_PARTS,
]
