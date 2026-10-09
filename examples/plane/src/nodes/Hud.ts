import { Label, Node2D, Signal, Sprite2D, v } from 'sapling2d'
import { ASSETS } from '../assets'
import { PLAYER } from '../config'

const LIFE_SCALE = v(0.32, 0.32)

/** 分数、剩余命数、暂停按钮。贴着安全区摆放，屏幕变化时重新排版。 */
export class Hud extends Node2D {
  /** 暂停按钮被按下。参数是按下它的指针，战斗场景据此不把这次触摸当成拖动。 */
  readonly pausePressed = new Signal<[pointerId: number]>()
  pauseButton!: Sprite2D
  private _score!: Label
  private readonly _lives: Sprite2D[] = []
  private _shownScore = -1

  override ready() {
    this._score = this.add(new Label({ name: 'Score', text: '0', fontSize: 44, fontWeight: 'bold', color: 0xffffff, stroke: { color: 0x101030, width: 6 }, align: 'left', verticalAlign: 'center' }))
    for (let i = 0; i < PLAYER.maxLives; i++) {
      this._lives.push(this.add(new Sprite2D({ name: `Life${i + 1}`, texture: ASSETS.sprites.get('player'), scale: LIFE_SCALE, visible: false })))
    }
    this.pauseButton = this.add(new Sprite2D({ name: 'PauseButton', texture: ASSETS.sprites.get('pause'), inputPickable: true, hitArea: { radius: 44 } }))
    this.pauseButton.pointerDown.connect((e) => this.pausePressed.emit(e.pointerId), this)
    this._layout()
    this.tree.viewport.resized.connect(() => this._layout(), this)
  }

  setScore(score: number) {
    if (score === this._shownScore) return // 改文字会重绘文字贴图：只在变化时设置
    this._shownScore = score
    this._score.text = String(score)
  }

  setLives(lives: number) {
    for (let i = 0; i < this._lives.length; i++) this._lives[i]!.visible = i < lives
  }

  private _layout() {
    const r = this.tree.viewport.safeRect
    this._score.position = v(r.left + 28, r.top + 50)
    this.pauseButton.position = v(r.right - 56, r.top + 50)
    this._lives.forEach((s, i) => (s.position = v(r.left + 40 + i * 46, r.bottom - 44)))
  }
}
