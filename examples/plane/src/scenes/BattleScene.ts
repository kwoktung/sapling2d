import { AnimatedSprite2D, AudioStreamPlayer, Node2D, Scene, v, type Vector2 } from 'sapling2d'
import { ASSETS } from '../assets'
import { BOSS, ENEMIES, ENEMY_BULLET, PLAYER, WAVES, WEAPON, type EnemyKind, type PowerUpKind } from '../config'
import { Background } from '../nodes/Background'
import { Boss } from '../nodes/Boss'
import { bounds, setBounds } from '../nodes/bounds'
import { Bullet } from '../nodes/Bullet'
import { compact, HitTester } from '../nodes/collision'
import { Enemy, type EnemyHost } from '../nodes/Enemy'
import { Hud } from '../nodes/Hud'
import { PauseController } from '../nodes/PauseController'
import { Player } from '../nodes/Player'
import { PowerUp } from '../nodes/PowerUp'
import { GameOverScene } from './GameOverScene'

export interface BattleParams {
  /** 自动出怪，默认 true。测试里关掉，自己摆放敌机。 */
  waves?: boolean
  /** 玩家无敌（测试出怪节奏用）。 */
  godMode?: boolean
}

/** 每级火力的弹道：[x 偏移, 角度（弧度，0 是正上方）]。 */
const VOLLEYS: readonly (readonly [number, number])[][] = [
  [[0, 0]],
  [[-12, 0], [12, 0]],
  [[0, 0], [-18, -0.12], [18, 0.12]],
  [[-14, 0], [0, 0], [14, 0], [-26, -0.16], [26, 0.16]],
]

/** 玩家死后多久进入结算。 */
const GAME_OVER_DELAY = 1.5

/**
 * 出怪的节奏：普通出怪（waves）→ 到时间先警告（warning）→ Boss 战（boss）→ 击败后歇一会儿（cleared）→ 回到普通出怪。
 */
type Stage = 'waves' | 'warning' | 'boss' | 'cleared'

/**
 * 战斗场景。所有会动的东西各自在 process 里移动；本场景负责输入、射击、出怪和碰撞。
 * 碰撞不用物理引擎（几百颗子弹会超出 iOS 小游戏的刚体预算），用 HitTester 做圆形判定。
 */
export class BattleScene extends Scene implements EnemyHost {
  static override assets = ASSETS

  player!: Player
  hud!: Hud
  score = 0
  /** 统计：射出的子弹数、射击轮数、出怪数和出怪记录（测试、调试用）。 */
  firedShots = 0
  firedVolleys = 0
  enemyBulletsFired = 0
  spawned = 0
  readonly spawnLog: { kind: EnemyKind; x: number; t: number }[] = []

  readonly playerBullets: Bullet[] = []
  readonly enemyBullets: Bullet[] = []
  readonly enemies: Enemy[] = []
  readonly powerUps: PowerUp[] = []
  /** 在场的 Boss（同一时间最多一个）。 */
  boss: Boss | null = null
  /** 已经出现过的 Boss 数。 */
  bossCount = 0

  /** 战场的所有图层都挂在它下面：震屏时整体晃动，界面不动。 */
  private _world!: Node2D
  private _playerBulletLayer!: Node2D
  private _enemyLayer!: Node2D
  private _powerUpLayer!: Node2D
  private _enemyBulletLayer!: Node2D
  private _fxLayer!: Node2D
  private readonly _hits = new HitTester()
  private _time = 0
  private _fireIn = 0
  private _spawnIn = 0.6
  private _gameOver = false
  private _stage: Stage = 'waves'
  /** 当前阶段的计时：warning / cleared 剩余秒数。 */
  private _stageLeft = 0
  /** 战斗时间到这里时开始下一个 Boss 的警告。 */
  private _nextBossAt = BOSS.firstAt
  private _shake = 0
  /** 正在拖动的指针和它上一帧的位置。 */
  private _dragId: number | null = null
  private _dragLast: Vector2 | null = null
  /** 按在暂停按钮上的指针：不当成拖动。 */
  private _ignorePointer: number | null = null

  constructor(readonly params: BattleParams = {}) {
    super()
  }

  override ready() {
    setBounds(this.tree.viewport.visibleRect)
    this.tree.viewport.resized.connect(() => setBounds(this.tree.viewport.visibleRect), this)

    // 绘制顺序 = 添加顺序：背景、玩家子弹、敌机（含 Boss）、道具、玩家、敌方子弹、爆炸，最后是界面
    this.add(new Background({ name: 'Background' }))
    const world = (this._world = this.add(new Node2D({ name: 'World' })))
    this._playerBulletLayer = world.add(new Node2D({ name: 'PlayerBullets' }))
    this._enemyLayer = world.add(new Node2D({ name: 'Enemies' }))
    this._powerUpLayer = world.add(new Node2D({ name: 'PowerUps' }))
    this.player = world.add(new Player(v((bounds.left + bounds.right) / 2, bounds.bottom - PLAYER.bottomMargin)))
    this.player.god = this.params.godMode ?? false
    this._enemyBulletLayer = world.add(new Node2D({ name: 'EnemyBullets' }))
    this._fxLayer = world.add(new Node2D({ name: 'Effects' }))
    this.hud = this.add(new Hud({ name: 'Hud' }))
    this.hud.setLives(this.player.lives)
    const pause = this.add(new PauseController())
    this.hud.pausePressed.connect((id) => {
      this._ignorePointer = id
      if (!this._gameOver) pause.pause()
    }, this)

    this.add(new AudioStreamPlayer({ name: 'Bgm', stream: ASSETS.bgm, loop: true, volume: 0.5, bus: 'Music', autoplay: true }))
  }

  override process(dt: number) {
    this._time += dt
    if (!this._gameOver) {
      this._movePlayer(dt)
      this._fire(dt)
    }
    if (this.params.waves ?? true) this._updateStage(dt)
    this._collide()
    this._updateShake(dt)
    if (this.boss) this.hud.setBossRatio(this.boss.hp / this.boss.maxHp)
    compact(this.playerBullets)
    compact(this.enemyBullets)
    compact(this.enemies)
    compact(this.powerUps)
    this.hud.setScore(this.score)
  }

  // ---------------------------------------------------------------- 生成（也是测试用的接口）

  spawnEnemy(kind: EnemyKind, position: Vector2): Enemy {
    const enemy = this._enemyLayer.add(new Enemy(kind, position, this))
    this.enemies.push(enemy)
    return enemy
  }

  spawnEnemyBullet(position: Vector2, velocity: Vector2, style: 'normal' | 'boss' = 'normal'): Bullet {
    const boss = style === 'boss'
    const b = this._enemyBulletLayer.add(
      new Bullet({
        name: 'EnemyBullet',
        texture: ASSETS.sprites.get(boss ? 'bullet_boss' : 'bullet_enemy'),
        position,
        vx: velocity.x,
        vy: velocity.y,
        radius: boss ? BOSS.bulletRadius : ENEMY_BULLET.radius,
      }),
    )
    this.enemyBullets.push(b)
    this.enemyBulletsFired++
    return b
  }

  /** 让 Boss 入场（血量随出场次数增长），显示血条。 */
  spawnBoss(): Boss {
    const hp = Math.round(BOSS.hp * BOSS.hpGrowth ** this.bossCount)
    this.bossCount++
    this.boss = this._enemyLayer.add(new Boss(hp, this))
    this.hud.showBossBar()
    return this.boss
  }

  spawnPowerUp(kind: PowerUpKind, position: Vector2): PowerUp {
    const p = this._powerUpLayer.add(new PowerUp(kind, position))
    this.powerUps.push(p)
    return p
  }

  // ---------------------------------------------------------------- 玩家

  private _movePlayer(dt: number) {
    const input = this.tree.input
    const p = this.player
    let x = p.x
    let y = p.y

    // 拖动：战机跟着手指的位移走，不跳到手指下面（手指不会挡住战机）
    if (this._dragId !== null && !input.pressedPointers.has(this._dragId)) {
      this._dragId = null
      this._dragLast = null
    }
    if (this._dragId === null) {
      for (const [id, pos] of input.pressedPointers) {
        if (id === this._ignorePointer) continue
        this._dragId = id
        this._dragLast = pos
        break
      }
    }
    if (this._ignorePointer !== null && !input.pressedPointers.has(this._ignorePointer)) this._ignorePointer = null
    if (this._dragId !== null) {
      const pos = input.pressedPointers.get(this._dragId)!
      x += pos.x - this._dragLast!.x
      y += pos.y - this._dragLast!.y
      this._dragLast = pos
    }

    // 键盘（浏览器）
    const speed = PLAYER.keyboardSpeed * dt
    if (input.isActionPressed('left')) x -= speed
    if (input.isActionPressed('right')) x += speed
    if (input.isActionPressed('up')) y -= speed
    if (input.isActionPressed('down')) y += speed

    const m = PLAYER.edgeMargin
    x = Math.min(bounds.right - m, Math.max(bounds.left + m, x))
    y = Math.min(bounds.bottom - m, Math.max(bounds.top + m, y))
    if (x !== p.x) p.x = x
    if (y !== p.y) p.y = y
  }

  private _fire(dt: number) {
    this._fireIn -= dt
    if (this._fireIn > 0) return
    this._fireIn += WEAPON.fireInterval
    const p = this.player
    const texture = ASSETS.sprites.get('bullet_player')
    for (const [dx, angle] of VOLLEYS[p.power - 1]!) {
      const b = new Bullet({
        name: 'Bullet',
        texture,
        position: v(p.x + dx, p.y - 56),
        rotation: angle,
        vx: Math.sin(angle) * WEAPON.bulletSpeed,
        vy: -Math.cos(angle) * WEAPON.bulletSpeed,
        radius: WEAPON.bulletRadius,
      })
      this.playerBullets.push(this._playerBulletLayer.add(b))
      this.firedShots++
    }
    if (this.firedVolleys++ % WEAPON.soundEvery === 0) this.tree.audio.play(ASSETS.shoot, { volume: 0.35 })
  }

  // ---------------------------------------------------------------- 出怪

  private _updateStage(dt: number) {
    switch (this._stage) {
      case 'waves':
        if (this._time >= this._nextBossAt) {
          this._stage = 'warning'
          this._stageLeft = BOSS.warningSeconds
          this.hud.showWarning(BOSS.warningSeconds)
        } else this._spawnWaves(dt)
        break
      case 'warning':
        if ((this._stageLeft -= dt) <= 0) {
          this._stage = 'boss'
          this.spawnBoss()
        }
        break
      case 'boss':
        break // 等 Boss 被击败（_destroyBoss 切到 cleared）
      case 'cleared':
        if ((this._stageLeft -= dt) <= 0) {
          this._stage = 'waves'
          this._nextBossAt = this._time + BOSS.interval
        }
        break
    }
  }

  private _spawnWaves(dt: number) {
    this._spawnIn -= dt
    while (this._spawnIn <= 0) {
      this._spawnIn += Math.max(WAVES.minInterval, WAVES.startInterval - WAVES.intervalDecay * this._time)
      this._spawnRandom()
    }
  }

  private _spawnRandom() {
    const rng = this.tree.rng
    const t = this._time
    const mediumShare = Math.min(0.35, Math.max(0, (t - WAVES.mediumFrom) / 40))
    const largeShare = Math.min(0.08, Math.max(0, (t - WAVES.largeFrom) / 150))
    const largeAlive = this.enemies.some((e) => e.kind === 'large' && !e.dead)
    const r = rng.randf()
    const kind: EnemyKind = r < largeShare && !largeAlive ? 'large' : r < largeShare + mediumShare ? 'medium' : 'small'
    const c = ENEMIES[kind]
    const margin = c.radius + c.sway + 10
    const x = bounds.left + margin + rng.randf() * Math.max(0, bounds.right - bounds.left - margin * 2)
    this.spawnEnemy(kind, v(x, bounds.top - c.radius - 20))
    this.spawned++
    this.spawnLog.push({ kind, x, t })
  }

  // ---------------------------------------------------------------- 碰撞

  private _collide() {
    // 玩家子弹 × 敌机
    this._hits.forEachHit(this.playerBullets, this.enemies, (bullet, enemy) => {
      bullet.kill()
      if (enemy.hit(WEAPON.damage)) this._destroyEnemy(enemy)
      return true
    })
    const boss = this.boss
    const bosses = BOSSES
    bosses.length = 0
    if (boss) {
      bosses.push(boss)
      // 玩家子弹 × Boss：入场途中子弹直接穿过
      if (!boss.entering) {
        this._hits.forEachHit(this.playerBullets, bosses, (bullet) => {
          bullet.kill()
          if (boss.hit(WEAPON.damage)) this._destroyBoss(boss)
          return true
        })
      }
    }
    const p = this.player
    if (!p.alive) return
    const players = PLAYERS
    players[0] = p
    // Boss × 玩家：掉命，Boss 不受影响
    if (this.boss) {
      this._hits.forEachHit(bosses, players, () => {
        if (!p.invincible) this._hurtPlayer()
        return true
      })
    }
    // 敌方子弹 × 玩家
    this._hits.forEachHit(this.enemyBullets, players, (bullet) => {
      if (p.invincible) return true
      bullet.kill()
      this._hurtPlayer()
      return true
    })
    // 敌机 × 玩家：撞毁敌机
    this._hits.forEachHit(this.enemies, players, (enemy) => {
      if (p.invincible) return true
      this._destroyEnemy(enemy)
      this._hurtPlayer()
      return true
    })
    // 道具 × 玩家
    this._hits.forEachHit(this.powerUps, players, (item) => {
      item.kill()
      if (item.kind === 'power') p.power++
      else p.lives = Math.min(PLAYER.maxLives, p.lives + 1)
      this.hud.setLives(p.lives)
      this.tree.audio.play(ASSETS.powerup)
      return true
    })
  }

  private _destroyEnemy(enemy: Enemy) {
    enemy.kill()
    this.score += enemy.config.score
    this._explode(enemy.position, enemy.config.explosionScale)
    this.tree.audio.play(ASSETS.explode, { volume: enemy.kind === 'small' ? 0.5 : 0.8 })
    const drop = enemy.config.drop
    const r = this.tree.rng.randf()
    if (r < drop.power) this.spawnPowerUp('power', enemy.position)
    else if (r < drop.power + drop.life) this.spawnPowerUp('life', enemy.position)
  }

  private _destroyBoss(boss: Boss) {
    boss.kill()
    this.boss = null
    this.hud.hideBossBar()
    this.score += BOSS.score
    this.tree.audio.play(ASSETS.explode)
    this._shake = 0.8
    for (const b of this.enemyBullets) b.kill() // 清掉场上的敌方子弹：击败 Boss 后给玩家喘口气
    // 连环爆炸：先一个大的，然后在机身各处每 0.12 秒炸一个
    const at = boss.position
    this._explode(at, 3)
    for (let i = 1; i <= 6; i++) {
      this.tree.createTimer(i * 0.12, { processAlways: false }).timeout.connect(() => {
        const rng = this.tree.rng
        this._explode(v(at.x + rng.randfRange(-110, 110), at.y + rng.randfRange(-70, 70)), rng.randfRange(1.2, 2))
        this.tree.audio.play(ASSETS.explode, { volume: 0.5 })
      }, this)
    }
    this.spawnPowerUp('power', v(at.x - 60, at.y))
    this.spawnPowerUp('power', v(at.x + 60, at.y))
    this.spawnPowerUp('life', v(at.x, at.y + 40))
    if (this._stage === 'boss') {
      this._stage = 'cleared'
      this._stageLeft = BOSS.resumeDelay
    }
  }

  /** 震屏：整个战场随机偏移，幅度随时间衰减。 */
  private _updateShake(dt: number) {
    if (this._shake <= 0) return
    this._shake = Math.max(0, this._shake - dt)
    const amp = 18 * this._shake
    const rng = this.tree.rng
    this._world.position = this._shake > 0 ? v(rng.randfRange(-amp, amp), rng.randfRange(-amp, amp)) : v(0, 0)
  }

  private _hurtPlayer() {
    const p = this.player
    if (!p.hurt()) return
    this.hud.setLives(p.lives)
    this.tree.audio.play(ASSETS.hit)
    if (p.alive) return
    // 最后一条命：战机爆炸，稍后进入结算
    this._gameOver = true
    this._explode(p.position, 1.8)
    p.visible = false
    this.tree.createTimer(GAME_OVER_DELAY).timeout.connect(() => this._finish(), this)
  }

  private _explode(at: Vector2, scale: number) {
    const fx = this._fxLayer.add(new AnimatedSprite2D({ name: 'Explosion', frames: ASSETS.explosion.frames(), fps: 20, loop: false, autoplay: true, position: at, scale: v(scale, scale) }))
    fx.animationFinished.connect(() => fx.queueFree(), fx)
  }

  private _finish() {
    const storage = this.tree.storage
    const best = Math.max(this.score, storage.get('best', 0))
    const newRecord = this.score > 0 && this.score >= best && this.score > storage.get('best', 0)
    storage.set('best', best)
    this.tree.audio.play(ASSETS.gameover)
    void this.tree.changeScene(GameOverScene, { score: this.score, best, newRecord })
  }
}

/** 只有玩家 / Boss 一个元素的数组（复用，不每帧分配）。 */
const PLAYERS: Player[] = []
const BOSSES: Boss[] = []
