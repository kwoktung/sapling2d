import type { Rect2 } from 'sapling2d'

/**
 * 当前可见区域（设计坐标），由战斗场景在进入和屏幕变化时更新。
 * 子弹每帧都要判断是否飞出屏幕：读这里的普通字段，比每颗子弹去读 tree.viewport.visibleRect 便宜。
 */
export const bounds = { left: 0, top: 0, right: 750, bottom: 1334 }

export function setBounds(r: Rect2): void {
  bounds.left = r.left
  bounds.top = r.top
  bounds.right = r.right
  bounds.bottom = r.bottom
}
