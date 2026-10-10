import { Sprite2D, type Vector2 } from 'sapling2d'
import { ASSETS } from '../assets'
import { Z } from '../config'
import type { Hero } from './Hero'

/** 英雄槽位：站着一个英雄或空着。拖动英雄时，松手处最近的槽位接住它。 */
export class Slot extends Sprite2D {
  hero: Hero | null = null

  constructor(
    readonly index: number,
    position: Vector2,
  ) {
    super({ texture: ASSETS.slot, position, zIndex: Z.slot })
  }

  /** 拖动时高亮（可以放下的槽位）。 */
  set highlighted(on: boolean) {
    this.selfModulate = on ? 0xc8ffc8 : 0xffffff
  }
}
