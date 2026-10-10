import type { EnemyKind } from './enemies'

/** 一波里的一组怪：`count` 只，每隔 `interval` 秒出一只，这一波开始 `delay` 秒后开始出；`elite` 是精英。 */
export interface SpawnGroup {
  kind: EnemyKind
  count: number
  interval: number
  delay: number
  elite?: boolean
}

export const WAVE_COUNT = 20

const g = (kind: EnemyKind, count: number, interval: number, delay = 0, elite = false): SpawnGroup => ({ kind, count, interval, delay, ...(elite ? { elite } : {}) })

/**
 * 每一波的组成（spec 的出场顺序）：1–2 史莱姆 · 3 蝙蝠 · 4 骷髅 · 5 精英 · 6 分裂史莱姆 · 7 萨满 · 8 幽灵 · 9 混合 ·
 * 10 史莱姆王 · 11–14 混合 · 15 精英 · 16–19 混合 · 20 骷髅巫妖（打死它就胜利）。
 */
export const WAVES: readonly (readonly SpawnGroup[])[] = [
  /* 1 */ [g('slime', 8, 1)],
  /* 2 */ [g('slime', 12, 0.8)],
  /* 3 */ [g('slime', 8, 1), g('bat', 6, 0.6, 3)],
  /* 4 */ [g('slime', 8, 0.9), g('skeleton', 5, 1.6, 2)],
  /* 5 精英 */ [g('slime', 12, 0.6), g('bat', 8, 0.5, 2), g('slime', 2, 3, 4, true)],
  /* 6 */ [g('slime', 10, 0.8), g('splitter', 6, 1.5, 2)],
  /* 7 */ [g('skeleton', 6, 1.3), g('shaman', 3, 3, 2), g('slime', 10, 0.7, 1)],
  /* 8 */ [g('ghost', 8, 1), g('bat', 8, 0.5, 3), g('slime', 8, 0.8)],
  /* 9 */ [g('skeleton', 8, 1), g('splitter', 6, 1.2, 2), g('shaman', 3, 3, 4), g('bat', 10, 0.4, 6)],
  /* 10 史莱姆王 */ [g('slime', 10, 0.6), g('slimeKing', 1, 1, 3), g('bat', 8, 0.6, 10)],
  /* 11 */ [g('ghost', 10, 0.8), g('skeleton', 8, 1, 2), g('shaman', 4, 2.5, 3)],
  /* 12 */ [g('splitter', 10, 0.9), g('bat', 14, 0.35, 2), g('slime', 12, 0.5)],
  /* 13 */ [g('skeleton', 12, 0.8), g('shaman', 5, 2, 2), g('ghost', 8, 0.8, 5)],
  /* 14 */ [g('slime', 20, 0.35), g('splitter', 10, 0.8, 3), g('bat', 16, 0.3, 6)],
  /* 15 精英 */ [g('skeleton', 12, 0.7), g('ghost', 10, 0.7, 2), g('skeleton', 3, 3, 4, true), g('shaman', 2, 4, 5, true)],
  /* 16 */ [g('ghost', 14, 0.6), g('shaman', 6, 1.8, 2), g('splitter', 10, 0.8, 4)],
  /* 17 */ [g('skeleton', 16, 0.6), g('bat', 20, 0.25, 3), g('shaman', 6, 1.5, 5)],
  /* 18 */ [g('splitter', 16, 0.6), g('ghost', 14, 0.6, 2), g('slime', 3, 2.5, 4, true)],
  /* 19 */ [g('skeleton', 18, 0.5), g('ghost', 16, 0.5, 2), g('shaman', 8, 1.2, 3), g('bat', 20, 0.25, 6)],
  /* 20 骷髅巫妖 */ [g('skeleton', 12, 0.6), g('lich', 1, 1, 4), g('ghost', 12, 0.6, 8), g('skeleton', 3, 4, 12, true)],
]
