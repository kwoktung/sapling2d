/**
 * 弹幕压测场景（飞机大战的典型负载），无头基准和浏览器 spike（spikes/bullets）共用。
 *
 * - 玩家在底部左右移动，持续发射扇形子弹，保持 `config.bullets` 颗子弹在屏幕上
 * - `config.enemies` 架敌机在上半屏漂移；子弹与敌机用手写的圆形判定（不走物理引擎）：
 *   先把敌机位置读进数组、每颗子弹的位置只读一次，内层循环只做算术（llms.txt「性能」一节的写法）
 * - 敌机被击中闪红（modulate），血量归零时播放爆炸帧动画并在别处重生
 * - 所有子弹挂在同一个父节点下：这是渲染同步最坏的情况
 */
import { AnimatedSprite2D, Node2D, Scene, sheet, Sprite2D, tex, v } from 'sapling2d'

export const config = { bullets: 500, enemies: 30 }

/** 剖析用：设置 clock 后，场景逻辑按阶段累计耗时（毫秒）到 sceneTimes。 */
export const profiling = { clock: null as (() => number) | null, sceneTimes: { filter: 0, spawn: 0, collide: 0 } }

const W = 750
const H = 1334
const BULLET_SPEED = 900
const BULLET_R = 8
const ENEMY_R = 40

export class Bullet extends Sprite2D {
  vx = 0
  vy = -BULLET_SPEED
  dead = false

  override process(dt: number) {
    this.x += this.vx * dt
    this.y += this.vy * dt
    if (this.y < -20 || this.x < -20 || this.x > W + 20) this.kill()
  }

  kill() {
    if (this.dead) return
    this.dead = true
    this.queueFree()
  }
}

export class Enemy extends Sprite2D {
  hp = 5
  phase = 0

  override process(dt: number) {
    this.phase += dt
    this.x += Math.sin(this.phase * 1.3) * 60 * dt
    this.y += Math.cos(this.phase * 0.9) * 20 * dt
  }

  hit() {
    this.modulate = 0xff5050
    this.createTween().to(this, { modulate: 0xffffff }, 0.15)
  }
}

export class BulletStorm extends Scene {
  static override assets = { bullet: tex('bullet.png'), enemy: tex('enemy.png'), boom: sheet('explosion.png', { columns: 4, rows: 2 }) }
  bulletLayer!: Node2D
  fxLayer!: Node2D
  bullets: Bullet[] = []
  enemies: Enemy[] = []
  player!: Sprite2D
  kills = 0
  private _t = 0
  private readonly _ex = new Float64Array(config.enemies)
  private readonly _ey = new Float64Array(config.enemies)

  override ready() {
    this.bulletLayer = this.add(new Node2D({ name: 'Bullets' }))
    this.fxLayer = this.add(new Node2D({ name: 'Fx' }))
    this.player = this.add(new Sprite2D({ name: 'Player', texture: BulletStorm.assets.enemy, position: v(W / 2, H - 120), flipV: true }))
    for (let i = 0; i < config.enemies; i++) this.enemies.push(this.add(new Enemy({ texture: BulletStorm.assets.enemy, position: this._randomSpot() })))
  }

  override process(dt: number) {
    this._t += dt
    this.player.x = W / 2 + Math.sin(this._t * 1.5) * 280

    const clock = profiling.clock
    const t0 = clock?.() ?? 0
    // 补充子弹：每帧最多补 1/20，弹幕平滑地增长到目标数量
    this.bullets = this.bullets.filter((b) => !b.dead)
    const t1 = clock?.() ?? 0
    const missing = Math.min(config.bullets - this.bullets.length, Math.ceil(config.bullets / 20))
    for (let i = 0; i < missing; i++) {
      const angle = ((i % 9) - 4) * 0.12 + (this.tree.rng.randf() - 0.5) * 0.05
      const b = new Bullet({ texture: BulletStorm.assets.bullet, position: v(this.player.x, this.player.y - 40) })
      b.vx = Math.sin(angle) * BULLET_SPEED
      b.vy = -Math.cos(angle) * BULLET_SPEED
      this.bullets.push(this.bulletLayer.add(b))
    }

    const t2 = clock?.() ?? 0
    // 子弹 × 敌机：圆形判定。位置先读进数组，内层循环不调用 getter
    const r2 = (BULLET_R + ENEMY_R) ** 2
    const enemies = this.enemies
    const ex = this._ex
    const ey = this._ey
    for (let j = 0; j < enemies.length; j++) {
      ex[j] = enemies[j]!.x
      ey[j] = enemies[j]!.y
    }
    const bullets = this.bullets
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i]!
      if (b.dead) continue
      const bx = b.x
      const by = b.y
      for (let j = 0; j < enemies.length; j++) {
        const dx = bx - ex[j]!
        const dy = by - ey[j]!
        if (dx * dx + dy * dy > r2) continue
        const e = enemies[j]!
        b.kill()
        e.hit()
        if (--e.hp <= 0) {
          this._explode(e)
          ex[j] = e.x // 敌机换了位置
          ey[j] = e.y
        }
        break
      }
    }
    if (clock) {
      const t3 = clock()
      profiling.sceneTimes.filter += t1 - t0
      profiling.sceneTimes.spawn += t2 - t1
      profiling.sceneTimes.collide += t3 - t2
    }
  }

  private _explode(e: Enemy) {
    this.kills++
    const fx = this.fxLayer.add(new AnimatedSprite2D({ frames: BulletStorm.assets.boom.frames(), fps: 24, loop: false, autoplay: true, position: e.position }))
    fx.animationFinished.connect(() => fx.queueFree(), fx)
    e.hp = 5
    e.position = this._randomSpot()
  }

  private _randomSpot() {
    const rng = this.tree.rng
    return v(60 + rng.randf() * (W - 120), 80 + rng.randf() * (H * 0.45))
  }
}
