import {
  AudioStreamPlayer,
  CollisionShape2D,
  Ease,
  Label,
  rect,
  rectangle,
  Scene,
  Sprite2D,
  StaticBody2D,
  v,
  type Vector2,
} from 'sapling2d'
import {
  ALL_ASSETS,
  ASSETS,
  DANGER_Y,
  DROP_COOLDOWN,
  DROP_Y,
  FLOOR_Y,
  FRUITS,
  MAX_DROP_LEVEL,
  MAX_LEVEL,
  OVER_LINE_LIMIT,
  TEXTURE_SCALE,
  WALL,
  WATERMELON_BONUS,
  WIDTH,
} from './config'
import { Fruit } from './Fruit'
import { GameOverScene } from './GameOverScene'

/** 对局：投放、合成、计分、判定结束。 */
export class GameScene extends Scene {
  static override assets = ALL_ASSETS

  score = 0
  /** 投放器上当前的水果等级 */
  currentLevel = 0
  /** 下一个水果等级（右上角预览） */
  nextLevel = 0
  #cooldown = 0
  #over = false
  #dropX = WIDTH / 2

  #scoreLabel!: Label
  #dropper!: Sprite2D
  #preview!: Sprite2D
  #musicButton!: Label

  override ready(): void {
    const tree = this.tree
    const safeTop = Math.max(tree.viewport.safeRect.top, 0)

    // 容器：地面、两侧墙（静态刚体）和它们的贴图。都做得比设计区域高，长屏手机上也能铺满可见区域
    this.#wall(v(WIDTH / 2, FLOOR_Y + 300), WIDTH, 600, ASSETS.floor)
    this.#wall(v(WALL / 2, 667), WALL, 2400, ASSETS.wall)
    this.#wall(v(WIDTH - WALL / 2, 667), WALL, 2400, ASSETS.wall)
    this.add(new Sprite2D({ name: 'DangerLine', texture: ASSETS.line, position: v(WIDTH / 2, DANGER_Y) }))

    // 界面
    this.#scoreLabel = this.add(new Label({ name: 'Score', text: '0', fontSize: 64, fontWeight: 'bold', stroke: { color: 0x5a3a1a, width: 8 }, position: v(40, safeTop + 30) }))
    const best = tree.storage.get('best', 0)
    this.add(new Label({ name: 'Best', text: `最高 ${best}`, fontSize: 28, color: 0x5a3a1a, position: v(44, safeTop + 110) }))
    this.add(new Label({ name: 'NextTitle', text: '下一个', fontSize: 24, color: 0x5a3a1a, align: 'center', position: v(WIDTH - 80, safeTop + 30) }))
    this.#preview = this.add(new Sprite2D({ name: 'Preview', position: v(WIDTH - 80, safeTop + 100) }))

    // 音乐开关：可点击的 Label（点它不会触发投放：被节点处理的按下不算 aim 动作）
    const muted = tree.storage.get('musicMuted', false)
    tree.audio.setBusMute('Music', muted)
    this.#musicButton = this.add(
      new Label({ name: 'Music', fontSize: 28, color: 0x5a3a1a, align: 'right', position: v(WIDTH - 40, safeTop + 160), inputPickable: true, hitArea: rect(-140, -10, 150, 60) }),
    )
    this.#musicButton.clicked.connect(() => this.toggleMusic(), this)
    this.#updateMusicLabel()
    this.add(new AudioStreamPlayer({ name: 'Bgm', stream: ASSETS.bgm, loop: true, volume: 0.5, autoplay: true }))

    // 投放器：显示当前水果，跟着手指左右移动
    this.#dropper = this.add(new Sprite2D({ name: 'Dropper', position: v(WIDTH / 2, DROP_Y) }))
    this.currentLevel = this.#randomLevel()
    this.nextLevel = this.#randomLevel()
    this.#updateDropper()
  }

  override process(dt: number): void {
    if (this.#over) return
    this.#cooldown = Math.max(0, this.#cooldown - dt)
    const input = this.tree.input
    if (input.isActionPressed('aim') && input.pointerPosition) this.#aim(input.pointerPosition.x)
    if (input.isActionJustReleased('aim') || input.isActionJustPressed('drop')) this.drop()
  }

  override physicsProcess(): void {
    if (this.#over) return
    for (const f of this.tree.getNodesInGroup('fruits')) {
      if (f.overLine > OVER_LINE_LIMIT) {
        this.#gameOver()
        return
      }
    }
  }

  /** 在投放器当前位置放下当前水果。冷却中不响应。 */
  drop(): void {
    if (this.#over || this.#cooldown > 0) return
    this.#cooldown = DROP_COOLDOWN
    this.spawnFruit(this.currentLevel, v(this.#dropX, DROP_Y))
    this.tree.audio.play(ASSETS.drop, { volume: 0.6 })
    this.currentLevel = this.nextLevel
    this.nextLevel = this.#randomLevel()
    this.#updateDropper()
  }

  /** 生成一个水果（测试也用它直接摆放水果）。 */
  spawnFruit(level: number, position: Vector2): Fruit {
    const fruit = this.add(new Fruit(level, position))
    fruit.bodyEntered.connect((other) => {
      if (other instanceof Fruit) this.#tryMerge(fruit, other)
    }, fruit)
    return fruit
  }

  toggleMusic(): void {
    const audio = this.tree.audio
    const muted = !audio.isBusMuted('Music')
    audio.setBusMute('Music', muted)
    this.tree.storage.set('musicMuted', muted)
    this.#updateMusicLabel()
  }

  #tryMerge(a: Fruit, b: Fruit): void {
    if (a.level !== b.level || a.merging || b.merging || a.isQueuedForDeletion || b.isQueuedForDeletion) return
    a.merging = b.merging = true
    a.queueFree()
    b.queueFree()
    const mid = a.position.lerp(b.position, 0.5)
    if (a.level === MAX_LEVEL) {
      // 两个西瓜：一起消失，奖励分和特效
      this.#addScore(WATERMELON_BONUS)
      this.tree.audio.play(ASSETS.big)
      this.#flash('西瓜大丰收！', mid)
      return
    }
    const merged = this.spawnFruit(a.level + 1, mid)
    merged.pop()
    this.#addScore(FRUITS[a.level + 1]!.score)
    if (a.level + 1 === MAX_LEVEL) {
      this.tree.audio.play(ASSETS.big)
      this.#flash('大西瓜！', mid)
    } else {
      this.tree.audio.play(ASSETS.merge, { volume: 0.7 })
    }
  }

  #addScore(points: number): void {
    this.score += points
    this.#scoreLabel.text = String(this.score)
  }

  /** 屏幕上弹出一行字，放大后淡出（缩小）并消失。 */
  #flash(text: string, at: Vector2): void {
    const label = this.add(new Label({ name: 'Flash', text, fontSize: 72, fontWeight: 'bold', color: 0xffe066, stroke: { color: 0x7a2e00, width: 10 }, align: 'center', verticalAlign: 'center', position: v(WIDTH / 2, Math.min(at.y, 700)), scale: v(0.2, 0.2), zIndex: 10 }))
    label
      .createTween()
      .to(label, { scale: v(1.1, 1.1) }, 0.3, Ease.BackOut)
      .wait(0.8)
      .to(label, { scale: v(0, 0) }, 0.2)
      .call(() => label.queueFree())
  }

  #gameOver(): void {
    this.#over = true
    const storage = this.tree.storage
    const best = storage.get('best', 0)
    const newBest = this.score > best
    if (newBest) storage.set('best', this.score)
    this.tree.audio.play(ASSETS.gameOver)
    void this.tree.changeScene(GameOverScene, { score: this.score, best: Math.max(best, this.score), newBest })
  }

  #aim(x: number): void {
    const r = FRUITS[this.currentLevel]!.radius
    this.#dropX = Math.min(Math.max(x, WALL + r), WIDTH - WALL - r)
    this.#dropper.x = this.#dropX
  }

  #updateDropper(): void {
    this.#dropper.texture = ASSETS.fruits[this.currentLevel]!
    this.#dropper.scale = v(TEXTURE_SCALE, TEXTURE_SCALE)
    this.#aim(this.#dropX)
    this.#preview.texture = ASSETS.fruits[this.nextLevel]!
    // 预览缩小显示：直径不超过 70 像素（贴图宽度是 4r 像素）
    const s = Math.min(TEXTURE_SCALE, 70 / (4 * FRUITS[this.nextLevel]!.radius))
    this.#preview.scale = v(s, s)
  }

  #updateMusicLabel(): void {
    this.#musicButton.text = this.tree.audio.isBusMuted('Music') ? '音乐：关' : '音乐：开'
  }

  #randomLevel(): number {
    return this.tree.rng.randiRange(0, MAX_DROP_LEVEL)
  }

  #wall(position: Vector2, w: number, h: number, texture: (typeof ASSETS)['floor']): void {
    const body = this.add(new StaticBody2D({ name: 'Wall', position, friction: 0.4 }))
    body.add(new CollisionShape2D({ shape: rectangle(w, h) }))
    // 贴图拉伸到和碰撞形状一样大（贴图尺寸见 scripts/gen-assets.mjs）
    const size = texture === ASSETS.floor ? { w: 750, h: 140 } : { w: 20, h: 1334 }
    body.add(new Sprite2D({ texture, scale: v(w / size.w, h / size.h) }))
  }
}
