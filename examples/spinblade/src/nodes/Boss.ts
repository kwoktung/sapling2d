import { ColorRect, Node2D, type Tween, v } from 'sapling2d'
import { ASSETS } from '../assets'
import { BOSS } from '../config'
import { Enemy, type EnemyWorld } from './Enemy'

export type BossPhase = 'move' | 'warn' | 'dash'

/**
 * Boss：更大、刀更多、血更厚，从不逃跑。刀圈转速一直在起伏；每隔几秒冲撞一次：
 * 先停下、在要冲的方向上闪一条红色预警区，然后高速冲过去。
 */
export class Boss extends Enemy {
  phase: BossPhase = 'move'
  /** 冲撞方向（单位向量）。 */
  dashX = 0
  dashY = 0
  /** 预警区：一条从 Boss 中心伸向冲撞方向的红色长条。 */
  readonly warning: Node2D
  private _phaseLeft = BOSS.dashEvery
  private _blink: Tween | null = null

  constructor(world: EnemyWorld, x: number, y: number) {
    super(world, x, y, { name: 'Boss', texture: ASSETS.boss, hp: BOSS.hp, radius: BOSS.radius, box: BOSS.box, spin: -BOSS.spin })
    this.speed = BOSS.speed
    const length = BOSS.dashSpeed * BOSS.dashTime + BOSS.radius
    this.warning = this.add(new Node2D({ name: 'Warning', visible: false, zIndex: -1 }))
    this.warning.add(new ColorRect({ position: v(0, -BOSS.warnWidth / 2), size: v(length, BOSS.warnWidth), color: 0xff3030, alpha: 0.35 }))
  }

  protected override think(): void {
    // 转速起伏：spin × (1 ± swing)
    const t = this.tree.time
    this.spin = -BOSS.spin * (1 + BOSS.spinSwing * Math.sin((t * Math.PI * 2) / BOSS.spinPeriod))
    if (this.passive || this.phase === 'move') {
      super.think()
      if (this.passive) return
    }
    this._phaseLeft -= this.tree.physicsDelta
    if (this.phase === 'move') {
      const player = this.world.player
      if (this._phaseLeft <= 0 && player && !player.dead) this._startWarn(player.x - this.x, player.y - this.y)
    } else if (this.phase === 'warn') {
      this.moveX = 0
      this.moveY = 0
      if (this._phaseLeft <= 0) this._startDash()
    } else {
      this.moveX = this.dashX * BOSS.dashSpeed
      this.moveY = this.dashY * BOSS.dashSpeed
      if (this._phaseLeft <= 0) {
        this.phase = 'move'
        this._phaseLeft = BOSS.dashEvery
      }
    }
  }

  /** Boss 不逃跑：看得到玩家就追。 */
  protected override decide(): void {
    super.decide()
    if (this.state === 'flee') {
      this.state = 'chase'
      this.reverse()
    }
  }

  private _startWarn(dx: number, dy: number): void {
    const d = Math.sqrt(dx * dx + dy * dy) || 1
    this.dashX = dx / d
    this.dashY = dy / d
    this.phase = 'warn'
    this._phaseLeft = BOSS.warnTime
    this.warning.rotation = Math.atan2(this.dashY, this.dashX)
    this.warning.visible = true
    // 闪烁：透明度来回变（游戏时间，打击停顿时也停）
    this.warning.alpha = 1
    this._blink?.kill()
    this._blink = this.warning.createTween().to(this.warning, { alpha: 0.3 }, 0.1).to(this.warning, { alpha: 1 }, 0.1).to(this.warning, { alpha: 0.3 }, 0.1).to(this.warning, { alpha: 1 }, 0.1)
  }

  private _startDash(): void {
    this.phase = 'dash'
    this._phaseLeft = BOSS.dashTime
    this.warning.visible = false
    this._blink?.kill()
  }

  protected override dumpProps(): Record<string, unknown> {
    return { ...super.dumpProps(), phase: this.phase }
  }
}
