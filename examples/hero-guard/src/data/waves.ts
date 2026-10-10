import type { EnemyKind } from './enemies'

/** 一波里的一组怪：`count` 只，每隔 `interval` 秒出一只，这一波开始 `delay` 秒后开始出。 */
export interface SpawnGroup {
  kind: EnemyKind
  count: number
  interval: number
  delay: number
}

export const WAVE_COUNT = 20

/** 每一波的组成。骨架阶段只有史莱姆，数量逐波增加；新怪物、精英波、Boss 在 08 / 09 加。 */
export const WAVES: readonly (readonly SpawnGroup[])[] = Array.from({ length: WAVE_COUNT }, (_, i) => [
  { kind: 'slime' as const, count: 6 + i * 2, interval: Math.max(0.35, 1 - i * 0.03), delay: 0 },
])
