import { CanvasLayer, ColorRect, Label, Rect2, Signal, v } from 'sapling2d'

const XP_W = 300
const XP_H = 14
const BOSS_W = 320
const BOSS_H = 12
/** Boss 血条半透明：它压在场地顶部（怪物出生的地方），不能挡住怪。 */
const BOSS_ALPHA = 0.7

/** 界面层：顶部的命、波次、等级和经验条，Boss 血条，屏幕中间的提示文字。 */
export class Hud extends CanvasLayer {
  readonly lives = new Label({ name: 'Lives', text: '', fontSize: 32, color: 0xffffff, align: 'left', stroke: { color: 0x000000, width: 4 } })
  readonly wave = new Label({ name: 'Wave', text: '', fontSize: 32, color: 0xffe080, align: 'right', stroke: { color: 0x000000, width: 4 } })
  readonly message = new Label({ name: 'Message', text: '', fontSize: 60, color: 0xffe060, align: 'center', verticalAlign: 'center', stroke: { color: 0x000000, width: 6 } })
  readonly level = new Label({ name: 'Level', text: '', fontSize: 28, color: 0xa0e0ff, align: 'left', verticalAlign: 'center', stroke: { color: 0x000000, width: 4 } })
  readonly xpBack = new ColorRect({ name: 'XpBack', size: v(XP_W, XP_H), color: 0x1a2a3a })
  readonly xpFill = new ColorRect({ name: 'XpFill', size: v(XP_W, XP_H), color: 0x60c0ff })
  /** Boss 血条：Boss 在场时显示在顶部中间。 */
  readonly bossName = new Label({ name: 'BossName', text: '', fontSize: 22, fontWeight: 'bold', color: 0xffb0b0, align: 'center', verticalAlign: 'center', stroke: { color: 0x000000, width: 4 }, alpha: BOSS_ALPHA, visible: false })
  readonly bossBack = new ColorRect({ name: 'BossBack', size: v(BOSS_W, BOSS_H), color: 0x2a1010, alpha: BOSS_ALPHA, visible: false })
  readonly bossFill = new ColorRect({ name: 'BossFill', size: v(BOSS_W, BOSS_H), color: 0xe04040 })

  /** 右上角的音乐 / 音效开关：点一下发出 `toggle`（Battle 切换静音并存档）。 */
  readonly toggle = new Signal<[bus: 'Music' | 'SFX']>()
  readonly musicToggle = this._toggleLabel('MusicToggle')
  readonly sfxToggle = this._toggleLabel('SfxToggle')

  constructor() {
    super({ name: 'Hud', layer: 10 })
  }

  private _toggleLabel(name: string): Label {
    // 点击区域比字大一圈（右对齐：原点在右边）
    return new Label({ name, text: '', fontSize: 24, color: 0xffffff, align: 'right', stroke: { color: 0x000000, width: 4 }, inputPickable: true, hitArea: new Rect2(-110, -12, 124, 56) })
  }

  /** 开关上的字：关掉的显示“关”、变灰。 */
  showMute(music: boolean, sfx: boolean): void {
    this.musicToggle.text = `音乐 ${music ? '关' : '开'}`
    this.musicToggle.color = music ? 0x9a9a9a : 0xffffff
    this.sfxToggle.text = `音效 ${sfx ? '关' : '开'}`
    this.sfxToggle.color = sfx ? 0x9a9a9a : 0xffffff
  }

  override ready() {
    this.add(this.lives)
    this.add(this.wave)
    this.add(this.message)
    this.add(this.level)
    this.add(this.xpBack)
    this.xpBack.add(this.xpFill)
    this.add(this.musicToggle)
    this.add(this.sfxToggle)
    this.musicToggle.clicked.connect(() => this.toggle.emit('Music'), this)
    this.sfxToggle.clicked.connect(() => this.toggle.emit('SFX'), this)
    this.add(this.bossName)
    this.add(this.bossBack)
    this.bossBack.add(this.bossFill)
    this._layout()
    this.tree.viewport.resized.connect(() => this._layout(), this)
  }

  update(lives: number, wave: number, total: number): void {
    this.lives.text = `命 ${lives}`
    this.wave.text = `第 ${wave} / ${total} 波`
  }

  /** 等级和这一级的经验进度（0–1）。 */
  updateXp(level: number, ratio: number): void {
    this.level.text = `Lv ${level}`
    this.xpFill.scale = v(Math.max(0, Math.min(1, ratio)), 1)
  }

  /** Boss 血条：`name` 为 null 时隐藏。 */
  updateBoss(name: string | null, ratio: number): void {
    this.bossName.visible = this.bossBack.visible = name !== null
    if (name === null) return
    if (this.bossName.text !== name) this.bossName.text = name
    this.bossFill.scale = v(Math.max(0, Math.min(1, ratio)), 1)
  }

  /** 显示一会儿提示文字；seconds <= 0 时一直显示。 */
  flash(text: string, seconds: number): void {
    this.message.text = text
    this.message.alpha = 1
    if (seconds > 0) this.message.createTween().wait(seconds).to(this.message, { alpha: 0 }, 0.3)
  }

  private _layout() {
    const r = this.tree.viewport.safeRect
    this.lives.position = v(r.left + 24, r.top + 24)
    this.wave.position = v(r.right - 24, r.top + 24)
    this.level.position = v(r.left + 24, r.top + 92)
    this.sfxToggle.position = v(r.right - 24, r.top + 80)
    this.musicToggle.position = v(r.right - 150, r.top + 80)
    this.xpBack.position = v(r.left + 100, r.top + 92 - XP_H / 2)
    const cx = (r.left + r.right) / 2
    this.bossName.position = v(cx, r.top + 130)
    this.bossBack.position = v(cx - BOSS_W / 2, r.top + 146)
    this.message.position = v((r.left + r.right) / 2, r.top + r.height * 0.3)
  }
}
