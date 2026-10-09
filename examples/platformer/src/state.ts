import { Node } from 'sapling2d'
import { START_LIVES } from './config'

/** 跨关卡（重开）保留的状态：分数、金币、剩余次数。Autoload。 */
export class GameState extends Node {
  score = 0
  coins = 0
  lives = START_LIVES

  reset(): void {
    this.score = 0
    this.coins = 0
    this.lives = START_LIVES
  }

  /** 吃到金币：100 个换一条命。 */
  addCoin(): void {
    this.coins++
    if (this.coins >= 100) {
      this.coins -= 100
      this.lives++
    }
  }

  protected override dumpProps(): Record<string, unknown> {
    return { score: this.score, coins: this.coins, lives: this.lives }
  }
}
