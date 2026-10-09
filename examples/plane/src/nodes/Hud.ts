import { Label, Node2D, Signal, Sprite2D, v } from 'sapling2d'
import { ASSETS } from '../assets'
import { PLAYER } from '../config'

const LIFE_SCALE = v(0.32, 0.32)
/** Boss 血条的宽高（设计像素）；用 8×8 的白色方块拉伸出来。 */
const BAR_W = 460
const BAR_H = 16

/** 分数、剩余命数、暂停按钮、Boss 警告和血条。贴着安全区摆放，屏幕变化时重新排版。 */
export class Hud extends Node2D {
  /** 暂停按钮被按下。参数是按下它的指针，战斗场景据此不把这次触摸当成拖动。 */
  readonly pausePressed = new Signal<[pointerId: number]>()
  pauseButton!: Sprite2D
  private _score!: Label
  private readonly _lives: Sprite2D[] = []
  private _shownScore = -1
  private _warning!: Label
  private _warningLeft = 0
  private _bossBar!: Node2D
  private _bossFill!: Sprite2D
  private _bossRatio = 1

  override ready() {
    this._score = this.add(new Label({ name: 'Score', text: '0', fontSize: 44, fontWeight: 'bold', color: 0xffffff, stroke: { color: 0x101030, width: 6 }, align: 'left', verticalAlign: 'center' }))
    for (let i = 0; i < PLAYER.maxLives; i++) {
      this._lives.push(this.add(new Sprite2D({ name: `Life${i + 1}`, texture: ASSETS.sprites.get('player'), scale: LIFE_SCALE, visible: false })))
    }
    this.pauseButton = this.add(new Sprite2D({ name: 'PauseButton', texture: ASSETS.sprites.get('pause'), inputPickable: true, hitArea: { radius: 44 } }))
    this.pauseButton.pointerDown.connect((e) => this.pausePressed.emit(e.pointerId), this)

    this._warning = this.add(new Label({ name: 'Warning', text: '⚠ BOSS 来袭 ⚠', fontSize: 64, fontWeight: 'bold', color: 0xff4d5e, stroke: { color: 0x200008, width: 8 }, align: 'center', verticalAlign: 'center', visible: false }))
    const white = ASSETS.sprites.get('white')
    this._bossBar = this.add(new Node2D({ name: 'BossBar', visible: false }))
    this._bossBar.add(new Sprite2D({ name: 'Back', texture: white, centered: false, position: v(-BAR_W / 2 - 3, -3), scale: v((BAR_W + 6) / 8, (BAR_H + 6) / 8), modulate: 0x000000, alpha: 0.6 }))
    this._bossFill = this._bossBar.add(new Sprite2D({ name: 'Fill', texture: white, centered: false, position: v(-BAR_W / 2, 0), scale: v(BAR_W / 8, BAR_H / 8), modulate: 0xff4d5e }))
    this._bossBar.add(new Label({ name: 'BossName', text: 'BOSS', fontSize: 24, fontWeight: 'bold', color: 0xffffff, align: 'right', verticalAlign: 'center', position: v(-BAR_W / 2 - 12, BAR_H / 2) }))
    this._layout()
    this.tree.viewport.resized.connect(() => this._layout(), this)
  }

  setScore(score: number) {
    if (score === this._shownScore) return // 改文字会重绘文字贴图：只在变化时设置
    this._shownScore = score
    this._score.text = String(score)
  }

  override process(dt: number) {
    if (this._warningLeft <= 0) return
    this._warningLeft -= dt
    this._warning.visible = this._warningLeft > 0
    this._warning.alpha = 0.55 + 0.45 * Math.sin(this._warningLeft * 12) // 闪烁
  }

  /** 显示 Boss 警告，`seconds` 秒后自动消失。 */
  showWarning(seconds: number) {
    this._warningLeft = seconds
    this._warning.visible = true
  }

  get warningVisible(): boolean {
    return this._warning.visible
  }

  showBossBar() {
    this._bossBar.visible = true
    this.setBossRatio(1)
  }

  hideBossBar() {
    this._bossBar.visible = false
  }

  /** 剩余血量比例 0–1。 */
  setBossRatio(ratio: number) {
    const r = Math.max(0, Math.min(1, ratio))
    if (r === this._bossRatio && this._bossBar.visible) return
    this._bossRatio = r
    this._bossFill.scale = v((BAR_W * r) / 8, BAR_H / 8)
  }

  get bossBarVisible(): boolean {
    return this._bossBar.visible
  }

  get bossBarRatio(): number {
    return this._bossRatio
  }

  setLives(lives: number) {
    for (let i = 0; i < this._lives.length; i++) this._lives[i]!.visible = i < lives
  }

  private _layout() {
    const r = this.tree.viewport.safeRect
    this._score.position = v(r.left + 28, r.top + 50)
    this.pauseButton.position = v(r.right - 56, r.top + 50)
    this._warning.position = v((r.left + r.right) / 2, r.top + r.height * 0.4)
    this._bossBar.position = v((r.left + r.right) / 2 + 30, r.top + 110)
    this._lives.forEach((s, i) => (s.position = v(r.left + 40 + i * 46, r.bottom - 44)))
  }
}
