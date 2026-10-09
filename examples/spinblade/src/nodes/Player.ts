import { ASSETS } from '../assets'
import { PLAYER, RING } from '../config'
import { Fighter } from './Fighter'

/** 玩家：摇杆或方向键移动（斜着走不更快；摇杆推得越远走得越快）。 */
export class Player extends Fighter {
  constructor(x: number, y: number) {
    super({ name: 'Player', texture: ASSETS.player, x, y, spin: RING.spin, hp: PLAYER.hp })
  }

  protected think(): void {
    const input = this.tree.input
    // 每个物理步读一次：getAxis 不分配内存；长度超过 1（键盘斜着按）时缩到 1
    let dx = input.getAxis('left', 'right')
    let dy = input.getAxis('up', 'down')
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 1) {
      dx /= len
      dy /= len
    }
    this.moveX = dx * PLAYER.speed
    this.moveY = dy * PLAYER.speed
  }
}
