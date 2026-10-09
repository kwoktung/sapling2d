import { circle, Sprite2D, type Sprite2DOptions } from 'sapling2d'
import { ASSETS } from '../assets'
import { KNIFE } from '../config'
import type { Fighter } from './Fighter'

const PICK_SHAPE = circle(KNIFE.pickRadius)

/**
 * 一把刀：在地上，或者在某个角色的刀圈里（`owner`）。不管在哪，都直接挂在场地节点下，
 * 刀圈里的刀由主人每个物理步按角度摆放（见 `Fighter.placeKnives`）。
 */
export class Knife extends Sprite2D {
  /** 捡拾判定的圆（HitTester）。 */
  readonly hitShape = PICK_SHAPE
  owner: Fighter | null = null

  constructor(options: Sprite2DOptions = {}) {
    super({ name: 'Knife', texture: ASSETS.knife, ...options })
  }

  /** HitTester 只让地上的刀参与捡拾：有主人的刀算失效，`HitTester.compact` 会把它从地上的刀里去掉。 */
  get dead(): boolean {
    return this.owner !== null
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), held: this.owner !== null || undefined }
  }
}
