import { music, sfx, tex } from 'sapling2d'

/** 水果等级表：半径（设计像素）、合成出这一级时的得分。与 scripts/gen-assets.mjs 保持一致。 */
export const FRUITS = [
  { name: '樱桃', radius: 26, score: 1 },
  { name: '草莓', radius: 36, score: 3 },
  { name: '葡萄', radius: 46, score: 6 },
  { name: '橘子', radius: 56, score: 10 },
  { name: '橙子', radius: 68, score: 15 },
  { name: '苹果', radius: 80, score: 21 },
  { name: '梨', radius: 92, score: 28 },
  { name: '桃子', radius: 106, score: 36 },
  { name: '菠萝', radius: 120, score: 45 },
  { name: '哈密瓜', radius: 136, score: 55 },
  { name: '西瓜', radius: 152, score: 66 },
] as const

export const MAX_LEVEL = FRUITS.length - 1
/** 两个西瓜相撞：一起消失，奖励分 */
export const WATERMELON_BONUS = 100
/** 投放时随机出现的最高等级 */
export const MAX_DROP_LEVEL = 4

// 布局（设计分辨率 750×1334）
export const WIDTH = 750
export const FLOOR_Y = 1220 // 地面上表面
export const WALL = 20 // 两侧墙厚
export const DANGER_Y = 330 // 警戒线
export const DROP_Y = 230 // 投放器高度
/** 投放冷却（秒） */
export const DROP_COOLDOWN = 0.5
/** 水果在警戒线以上停留超过这么久（秒）判定游戏结束；刚投下的水果有 GRACE 秒豁免 */
export const OVER_LINE_LIMIT = 2
export const GRACE = 1

/** 贴图是 2 倍分辨率：显示时缩放 0.5 */
export const TEXTURE_SCALE = 0.5

export const ASSETS = {
  fruits: FRUITS.map((_, i) => tex(`fruits/${i}.png`)),
  line: tex('ui/line.png'),
  floor: tex('ui/floor.png'),
  wall: tex('ui/wall.png'),
  drop: sfx('sfx/drop.mp3'),
  merge: sfx('sfx/merge.mp3'),
  big: sfx('sfx/big.mp3'),
  gameOver: sfx('sfx/gameover.mp3'),
  bgm: music('bgm.mp3'),
}

/** 场景的 static assets 要求扁平的 { 名字: 资源 } */
export const ALL_ASSETS = {
  ...Object.fromEntries(ASSETS.fruits.map((t, i) => [`fruit${i}`, t])),
  line: ASSETS.line,
  floor: ASSETS.floor,
  wall: ASSETS.wall,
  drop: ASSETS.drop,
  merge: ASSETS.merge,
  big: ASSETS.big,
  gameOver: ASSETS.gameOver,
  bgm: ASSETS.bgm,
}

declare module 'sapling2d' {
  interface GroupRegistry {
    fruits: import('./Fruit').Fruit
  }
  interface ActionRegistry {
    aim: true
    drop: true
  }
  interface StorageRegistry {
    best: number
    musicMuted: boolean
  }
}
