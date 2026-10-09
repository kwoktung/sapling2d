import { Camera2D, HitTester, Scene, type TileMapLayer } from 'sapling2d'
import { ASSETS } from '../assets'
import { GOOMBA, PLAYER, RESTART_DELAY, SCORE, TILE, TILE_USED, TIME_TICK } from '../config'
import { Coin, CoinPop } from '../nodes/Coin'
import { Controls } from '../nodes/Controls'
import { Goomba } from '../nodes/Goomba'
import { Hud } from '../nodes/Hud'
import { Mario } from '../nodes/Mario'
import { GameState } from '../state'

/**
 * 关卡：从 Tiled 关卡创建图块层，按对象层放马里奥、敌人、金币和终点；相机只向右卷动。
 * 马里奥和敌人、金币之间用 HitTester 判断（矩形），被地形挡住交给 CharacterBody2D。
 */
export class Level extends Scene {
  static override assets = ASSETS
  mario!: Mario
  ground!: TileMapLayer
  camera!: Camera2D
  hud!: Hud
  controls!: Controls
  readonly goombas: Goomba[] = []
  readonly coins: Coin[] = []
  /** 剩余时间（格）。 */
  time = 0
  /** 终点（旗杆那一列）的左边缘：马里奥碰到就过关。 */
  goalX = 0
  private _timeAcc = 0
  private readonly _hits = new HitTester()
  /** HitTester 的 a 组：只有马里奥（复用的数组）。 */
  private readonly _players: Mario[] = []
  private _state!: GameState

  override ready() {
    const level = ASSETS.level
    this._state = this.tree.autoload(GameState)
    for (const layer of level.createLayers()) this.add(layer)
    this.ground = this.children.find((n) => n.name === 'Ground') as TileMapLayer
    this.time = Number(level.properties.time ?? 300)

    for (const o of level.objects('Entities')) {
      // 矩形对象的 (x, y) 是左上角，点对象就是点本身
      if (o.type === 'Spawn') this.mario = new Mario(o.x, o.y + TILE - PLAYER.height / 2)
      else if (o.type === 'Goomba') this.goombas.push(this.add(new Goomba(o.x + o.width / 2, o.y + o.height - GOOMBA.height / 2)))
      else if (o.type === 'Coin') this.coins.push(this.add(new Coin(o.x + o.width / 2, o.y + o.height / 2)))
      else if (o.type === 'Goal') this.goalX = o.x
    }
    this.add(this.mario) // 最后加：画在敌人和金币上面
    this.mario.onBump = (layer, cx, cy) => this.bump(layer, cx, cy)

    // 相机：只向右卷动，不超出关卡（process 里推进）
    this.camera = this.add(new Camera2D({ limitLeft: 0, limitTop: 0, limitRight: level.pixelWidth, limitBottom: level.pixelHeight }))
    this.camera.position = this.mario.position
    this.hud = this.add(new Hud())
    this.controls = this.add(new Controls())
    this._updateHud()
  }

  override process(dt: number) {
    const mario = this.mario
    const vp = this.tree.viewport
    const halfW = vp.visibleRect.width / 2
    const mapW = ASSETS.level.pixelWidth

    if (!mario.isDead) {
      // 相机只向右：中心不回退；马里奥不能走出左边界
      if (mario.x > this.camera.x) this.camera.x = mario.x
      mario.leftLimit = Math.max(0, Math.min(this.camera.x, mapW - halfW) - halfW)
    }

    // 进入屏幕附近的敌人开始走；掉出关卡的消失
    const wakeX = Math.min(this.camera.x, mapW - halfW) + halfW + GOOMBA.wakeDistance
    for (let i = 0; i < this.goombas.length; i++) {
      const g = this.goombas[i]!
      if (!g.awake && g.x - GOOMBA.width / 2 < wakeX) g.awake = true
      if (!g.dead && g.y > ASSETS.level.pixelHeight + TILE) {
        g.dead = true
        g.queueFree()
      }
    }

    if (mario.state === 'play') {
      this._collide()
      if (mario.y - PLAYER.height / 2 > ASSETS.level.pixelHeight) this.die(true)
      else if (mario.x + PLAYER.width / 2 >= this.goalX - 0.5) this.clear() // 碰到旗杆（旗杆底下的砖会挡住，所以按右边缘算）
      this._timeAcc += dt
      while (this._timeAcc >= TIME_TICK && this.time > 0) {
        this._timeAcc -= TIME_TICK
        this.time--
        if (this.time === 0) this.die(false)
      }
    }
    HitTester.compact(this.goombas)
    HitTester.compact(this.coins)
    this._updateHud()
  }

  /** 马里奥 × 敌人：下落中、上一步脚底在敌人中心以上算踩，否则死亡。马里奥 × 金币：吃掉。 */
  private _collide() {
    const mario = this.mario
    const players = this._players
    players[0] = mario
    this._hits.forEachHit(players, this.goombas, (_, g) => {
      if (mario.prevVelocityY > 0 && mario.prevBottom <= g.y) {
        g.squash()
        mario.bounce()
        this._state.score += SCORE.stomp
        return false // 同时踩到两个时都算
      }
      this.die(false)
      return true
    })
    if (mario.isDead) return
    this._hits.forEachHit(players, this.coins, (_, c) => {
      c.queueFree()
      this._state.addCoin()
      this._state.score += SCORE.coin
      return false
    })
  }

  /** 顶到格子：砖块碎掉，问号块变成空块并弹出金币。 */
  bump(layer: TileMapLayer, cx: number, cy: number) {
    if (layer !== this.ground) return
    const data = layer.getCellTileData(cx, cy)?.data
    if (!data) return
    if (data.breakable) {
      layer.eraseCell(cx, cy)
      this._state.score += SCORE.brick
    } else if (data.question === 'coin') {
      layer.setCell(cx, cy, TILE_USED)
      this.add(new CoinPop((cx + 0.5) * TILE + layer.x, cy * TILE + layer.y - TILE / 2))
      this._state.addCoin()
      this._state.score += SCORE.coin
    }
  }

  /** 失去一条命：等一会儿重开这一关；没有命了从头开始。 */
  die(fell: boolean) {
    if (this.mario.state !== 'play') return
    this.mario.die(fell)
    this.tree.createTimer(RESTART_DELAY).timeout.connect(() => {
      const state = this._state
      state.lives--
      if (state.lives <= 0) state.reset()
      void this.tree.reloadCurrentScene()
    }, this)
  }

  /** 走到终点：剩余时间换分数，显示过关；按跳跃键重新开始。 */
  clear() {
    this.mario.state = 'clear'
    this._state.score += this.time * SCORE.timeBonus
    this.time = 0
    this.hud.showMessage('COURSE CLEAR!')
  }

  override physicsProcess() {
    if (this.mario.state === 'clear' && this.tree.input.isActionJustPressed('jump')) {
      this._state.reset()
      void this.tree.reloadCurrentScene()
    }
  }

  private _updateHud() {
    this.hud.update(this._state.score, this._state.coins, this.time)
  }
}
