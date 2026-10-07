import { Ease, Label, rect, Scene, v } from 'sapling2d'
import { WIDTH } from './config'
import { GameScene } from './GameScene'

export interface GameOverParams {
  score: number
  best: number
  newBest: boolean
}

/** 结算：显示得分和最高分，点“再来一局”重开。 */
export class GameOverScene extends Scene {
  constructor(readonly params: GameOverParams) {
    super()
  }

  override ready(): void {
    const { score, best, newBest } = this.params
    this.add(new Label({ name: 'Title', text: '游戏结束', fontSize: 80, fontWeight: 'bold', color: 0x5a3a1a, align: 'center', position: v(WIDTH / 2, 380) }))
    this.add(new Label({ name: 'Score', text: `得分 ${score}`, fontSize: 56, color: 0x5a3a1a, align: 'center', position: v(WIDTH / 2, 540) }))
    this.add(new Label({ name: 'Best', text: newBest ? '新纪录！' : `最高 ${best}`, fontSize: 40, color: newBest ? 0xd9480f : 0x8a6a4a, align: 'center', position: v(WIDTH / 2, 630) }))

    const again = this.add(
      new Label({
        name: 'Again',
        text: '再来一局',
        fontSize: 52,
        fontWeight: 'bold',
        color: 0xffffff,
        stroke: { color: 0xd9480f, width: 12 },
        align: 'center',
        verticalAlign: 'center',
        position: v(WIDTH / 2, 860),
        inputPickable: true,
        hitArea: rect(-170, -60, 340, 120),
      }),
    )
    again.clicked.connect(() => void this.tree.changeScene(GameScene), this)
    // 呼吸动画：提示可以点
    const breathe = () => {
      again.createTween().to(again, { scale: v(1.08, 1.08) }, 0.6, Ease.SineInOut).to(again, { scale: v(1, 1) }, 0.6, Ease.SineInOut).call(breathe)
    }
    breathe()
  }
}
