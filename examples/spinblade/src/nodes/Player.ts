import { ASSETS } from '../assets'
import { PLAYER, RING } from '../config'
import { Fighter } from './Fighter'

/** 玩家：按方向键移动（斜着走不更快）。 */
export class Player extends Fighter {
  constructor(x: number, y: number) {
    super('Player', ASSETS.player, x, y, RING.spin)
  }

  protected think(): void {
    const input = this.tree.input
    const dx = (input.isActionPressed('right') ? 1 : 0) - (input.isActionPressed('left') ? 1 : 0)
    const dy = (input.isActionPressed('down') ? 1 : 0) - (input.isActionPressed('up') ? 1 : 0)
    const s = dx !== 0 && dy !== 0 ? PLAYER.speed * Math.SQRT1_2 : PLAYER.speed
    this.moveX = dx * s
    this.moveY = dy * s
  }
}
