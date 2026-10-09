import { ASSETS } from '../assets'
import { RING } from '../config'
import { Fighter } from './Fighter'

/** 敌人：刀圈反向转。目前站着不动（追击和游走见工单 07），只会被推开。 */
export class Enemy extends Fighter {
  constructor(x: number, y: number) {
    super('Enemy', ASSETS.enemy, x, y, -RING.spin)
  }

  protected think(): void {
    this.moveX = 0
    this.moveY = 0
  }
}
