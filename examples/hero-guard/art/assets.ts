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
  /**
   * 原图直接用这个文件（相对 art/，通常是 refs/ 里挑定的候选图），不调用 API。
   * AI 每次生成都不一样：挑定之后用它固定下来，以后重新抠图、打包结果不变。`prompt` 留着记录它是怎么来的。
   */
  from?: string
  /** 画面比例，默认 '1:1'（背景用 '9:16'）。 */
  aspect?: '1:1' | '9:16'
  /**
   * false：不抠图（背景；黑底的特效贴图——游戏里叠加发光时黑色等于透明）。提示词里的背景说明也跟着变成黑底 / 不要求纯色。
   * 默认 true。
   */
  key?: boolean
  /** 显示宽度（像素）：按宽缩放（背景）；不设时按 `displayHeight`。 */
  displayWidth?: number
  /** true：不套角色的风格模板、不附风格锚点（特效、背景、界面这些不是角色的素材）。 */
  plain?: boolean
  /** 不进图集，单独输出成 `public/assets/<id>.<publish>`（背景用 jpg：体积小得多）。 */
  publish?: 'jpg' | 'png'
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

/** 怪物和 Boss：提示词、背景色（紫色、蓝紫色的用绿色背景）、显示高度。都朝右（游戏里按行进方向翻转）。 */
const ENEMY_ART: Record<string, { prompt: string; height: number; background?: string }> = {
  slime: { prompt: 'A cute round green slime monster with big shiny eyes and a small mischievous smile, glossy jelly body.', height: 64 },
  bat: { prompt: 'A small cute purple bat monster with spread wings and glowing yellow eyes, flying.', height: 60, background: '#00FF00' },
  skeleton: { prompt: 'A cute chibi skeleton warrior monster wearing a dented iron helmet, holding a small rusty sword and a wooden shield, walking.', height: 84 },
  splitter: { prompt: 'A cute bluish-violet slime monster with a visible crack down the middle of its body, as if about to split in two, worried eyes.', height: 72, background: '#00FF00' },
  shaman: { prompt: 'A cute chibi goblin shaman monster with green skin and pointy ears, wearing a bone headdress and a tattered brown robe, holding a staff with a glowing green crystal.', height: 84 },
  ghost: { prompt: 'A cute white sheet ghost monster with a wavy bottom edge, big dark eyes and a playful spooky expression, floating.', height: 80 },
  slimeKing: { prompt: 'A huge cute green slime king boss monster wearing a big golden crown with red gems, a royal red cape draped over its back, confident grin.', height: 170 },
  lich: { prompt: 'A cute but menacing chibi lich boss monster: a skeleton in a flowing dark purple robe with gold trim, glowing green eyes, holding a tall bone staff topped with a green skull flame.', height: 190, background: '#00FF00' },
}

/**
 * 12：怪物和 Boss。每种先按提示词生成 2 张候选，用户挑定的那张存进 `refs/enemy_<kind>.jpg`（`from`）。
 * 萨满挑定的那张水晶有光晕（和背景混成粉色），基于它再编辑一次去掉光晕。小史莱姆用史莱姆的图缩小。
 */
const ENEMY_PARTS: AssetSpec[] = Object.entries(ENEMY_ART).map(([kind, e]) => {
  const common = {
    id: `enemy_${kind}`,
    displayHeight: e.height,
    atlas: 'enemies',
    pivot: { x: 0.5, y: 1 },
    ...(e.background ? { background: e.background } : {}),
  }
  if (kind === 'shaman') {
    return {
      ...common,
      mode: 'edit' as const,
      refs: ['refs/enemy_shaman_src.jpg'],
      prompt: 'Edit this image: remove the glow and sparkles around the green crystal on the staff, keep the crystal itself. Keep everything else exactly the same.',
    }
  }
  return {
    ...common,
    mode: 'generate' as const,
    from: `refs/enemy_${kind}.jpg`,
    prompt: `${e.prompt} Facing slightly to the right. A monster for the heroes to fight, same chibi style as the reference hero.`,
  }
})

/**
 * 13：特效、背景、界面。都是 plain：不套角色风格、不附风格锚点。挑定的候选存进 `refs/`（`from`）。
 * - 特效黑底不抠图：游戏里叠加发光（`blendMode: 'add'`），黑色等于透明；箭和界面是品红底、抠图。
 * - 背景单独发布成 jpg（不进图集）。
 * - 图标（技能分支、通用强化、大招）没出候选，生成一次看过之后存进 `refs/`。
 */
const VFX: Record<string, { prompt: string; height: number }> = {
  slash: { prompt: 'a bright white-to-cyan crescent sword slash arc, a sweeping curved swoosh with glowing edges and speed streaks, the arc opening downward', height: 200 },
  fireball: { prompt: 'a round fireball with swirling orange and yellow flames and a bright hot core', height: 64 },
  ice: { prompt: 'a burst of sharp light-blue ice crystal shards radiating from the center, frosty sparkles', height: 130 },
  lightning: { prompt: 'a single jagged electric lightning bolt running horizontally from left to right, bright white core with light blue glow', height: 60 },
  poison: { prompt: 'a puff of toxic green poison gas cloud with a few bubbles', height: 140 },
  explosion: { prompt: 'a big cartoon fiery explosion burst with orange and yellow flames, a smoke ring and flying sparks', height: 260 },
}

const ICONS: Record<string, string> = {
  archer_multishot: 'three arrows flying side by side in a fan',
  archer_sniper: 'a red crosshair target with an arrow hitting the bullseye',
  archer_poison: 'an arrow with a green dripping poison tip',
  mage_fire: 'a burning orange flame',
  mage_frost: 'a light blue snowflake ice crystal',
  mage_lightning: 'a yellow lightning bolt',
  knight_smash: 'a heavy steel hammer striking down with an impact burst',
  knight_whirl: 'a sword spinning in a circular whirlwind',
  knight_guard: 'a round blue and silver shield',
  generic_attackSpeed: 'a winged boot with speed lines',
  generic_damage: 'a sharp glowing sword blade',
  generic_lives: 'a stone castle wall with a red heart',
  generic_ultCharge: 'a glowing golden energy orb',
  generic_xp: 'an open magic book with sparkles',
  ult_archer: 'a rain of many arrows falling from the sky',
  ult_mage: 'a flaming meteor falling down',
  ult_knight: 'a knight charging forward with a lance and dust trail',
}

const ART_13: AssetSpec[] = [
  {
    id: 'bg',
    mode: 'generate',
    plain: true,
    key: false,
    aspect: '9:16',
    displayHeight: 1334,
    displayWidth: 750,
    publish: 'jpg',
    from: 'refs/bg.jpg',
    prompt:
      'A vertical background for a portrait mobile tower defense game, seen from above at a slight angle, polished cartoon style with clean outlines and soft flat shading. A lush green meadow battlefield. At the very top edge: a glowing purple magic portal in front of a dark forest edge, where monsters come from. At the very bottom edge: a sturdy grey stone castle wall with a wooden gate spanning the whole width. In between: open grass with tiny flowers; a few rocks and bushes only along the left and right edges; the large central area is clear, evenly lit and has NO roads, NO paths, NO characters.',
  },
  {
    id: 'ui_panel',
    mode: 'generate',
    plain: true,
    displayHeight: 100,
    atlas: 'ui',
    from: 'refs/ui_panel.jpg',
    prompt:
      'A square game UI panel frame for a cartoon fantasy mobile game: a thick carved wooden border with small golden corner ornaments, and a plain empty parchment paper center. Flat front view, perfectly symmetric, bold dark outlines, flat cel shading. Nothing inside the panel.',
  },
  {
    id: 'ui_button',
    mode: 'generate',
    plain: true,
    displayHeight: 50,
    atlas: 'ui',
    from: 'refs/ui_button.jpg',
    prompt:
      'A wide rounded rectangle game UI button for a cartoon fantasy mobile game: green with a light glossy highlight on top, a darker green bottom edge and a thick dark outline. Flat front view, symmetric, empty with no text or icon.',
  },
  ...Object.entries(VFX).map(([id, e]) => ({
    id: `fx_${id}`,
    mode: 'generate' as const,
    plain: true,
    key: false,
    background: '#000000',
    displayHeight: e.height,
    atlas: 'fx',
    from: `refs/fx_${id}.jpg`,
    prompt: `A game visual effect sprite for a cartoon mobile game: ${e.prompt}. Only the effect itself, centered, with empty margin around it.`,
  })),
  {
    id: 'fx_arrow',
    mode: 'generate',
    plain: true,
    displayHeight: 44,
    atlas: 'fx',
    from: 'refs/fx_arrow.jpg',
    prompt: 'A single wooden arrow with a steel arrowhead and white feathers, pointing straight up, isolated object, cartoon fantasy mobile game style with bold dark outlines and flat cel shading.',
  },
  ...Object.entries(ICONS).map(([id, what]) => ({
    id: `icon_${id}`,
    mode: 'generate' as const,
    plain: true,
    displayHeight: 64,
    atlas: 'ui',
    from: `refs/icon_${id}.jpg`,
    prompt: `A square game skill icon for a cartoon fantasy mobile game: ${what}, centered on a round dark slate badge with a thick golden rim. Bold dark outlines, flat cel shading, bright saturated colors, readable at small size.`,
  })),
]

/** 16：英雄阵亡后的墓碑（进英雄图集，锚点在底部）、通用选项“坚韧”的图标。 */
const ART_16: AssetSpec[] = [
  {
    id: 'tombstone',
    mode: 'generate',
    plain: true,
    displayHeight: 70,
    pivot: { x: 0.5, y: 0.95 },
    prompt:
      'A small cute cartoon grey stone tombstone with a rounded top and a simple cross carved on it, a little tuft of grass at its base, front view, isolated object, cartoon fantasy mobile game style with bold dark outlines and flat cel shading.',
  },
  {
    id: 'icon_generic_hp',
    mode: 'generate',
    plain: true,
    displayHeight: 64,
    prompt:
      'A square game skill icon for a cartoon fantasy mobile game: a big red heart with a steel shield behind it, centered on a round dark slate badge with a thick golden rim. Bold dark outlines, flat cel shading, bright saturated colors, readable at small size.',
  },
]

export const ASSETS: AssetSpec[] = [
  ...ART_16,
  ...ART_13,
  ...ENEMY_PARTS,
  ...HERO_PARTS,
]
