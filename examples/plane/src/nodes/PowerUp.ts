import { Sprite2D, v, type Vector2 } from 'sapling2d'
import { ASSETS } from '../assets'
import { POWERUP, type PowerUpKind } from '../config'
import { bounds } from './bounds'

// 一闪一闪：两个固定的缩放值，避免每帧分配 Vector2
const SCALE_A = v(1, 1)
const SCALE_B = v(1.12, 1.12)

/** 道具：慢慢往下飘，左右轻轻摆；碰到玩家时生效。 */
export class PowerUp extends Sprite2D {
  readonly kind: PowerUpKind
  readonly radius = POWERUP.radius
  dead = false
  private readonly _baseX: number
  private _age = 0

  constructor(kind: PowerUpKind, position: Vector2) {
    super({ name: `PowerUp_${kind}`, texture: ASSETS.sprites.get(kind === 'power' ? 'powerup_power' : 'powerup_life'), position })
    this.kind = kind
    this._baseX = position.x
  }

  override process(dt: number) {
    this._age += dt
    this.y += POWERUP.speed * dt
    this.x = this._baseX + Math.sin(this._age * 3) * 20
    this.scale = this._age % 0.6 < 0.3 ? SCALE_A : SCALE_B
    if (this.y > bounds.bottom + 60) this.kill()
  }

  kill() {
    if (this.dead) return
    this.dead = true
    this.queueFree()
  }
}
