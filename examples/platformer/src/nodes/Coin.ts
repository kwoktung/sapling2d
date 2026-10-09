import { AnimatedSprite2D, Ease, rectangle, type RectangleShape2D, v } from 'sapling2d'
import { ASSETS } from '../assets'

const SHAPE = rectangle(10, 14)

/** 关卡里的金币（对象层的 Coin）：转动，碰到就吃掉。 */
export class Coin extends AnimatedSprite2D {
  readonly hitShape: RectangleShape2D = SHAPE

  constructor(x: number, y: number) {
    super({ name: 'Coin', frames: ASSETS.coin.frames(), fps: 8, position: v(x, y) })
  }
}

/** 顶问号块弹出的金币：向上跳一下再消失。 */
export class CoinPop extends AnimatedSprite2D {
  constructor(x: number, y: number) {
    super({ name: 'CoinPop', frames: ASSETS.coin.frames(), fps: 16, position: v(x, y), zIndex: -1 })
  }

  override ready() {
    this.createTween()
      .to(this, { y: this.y - 40 }, 0.25, Ease.QuadOut)
      .to(this, { y: this.y - 16, alpha: 0 }, 0.2, Ease.QuadIn)
      .call(() => this.queueFree())
  }
}
