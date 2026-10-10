// #region example
import { AnimatedSprite2D, atlas, Scene, v } from 'sapling2d'
// TexturePacker 打包 PNG 序列（hero_attack_01.png …）导出的 JSON；图片放在 public/assets/
import knightData from './knight.json'

// 帧时长和命中帧写在数据里：美术加减帧时只改这里（长度对不上会报错，指出是哪套动画）
const KNIGHT = {
  idle: { fps: 4 },
  attack: { durations: [0.1, 0.2, 0.04, 0.04, 0.15], hitFrame: 2 },
}

export class Arena extends Scene {
  static override assets = { knight: atlas('knight.png', knightData) }
  knight!: AnimatedSprite2D<'idle' | 'attack'>

  override ready() {
    const sheet = Arena.assets.knight
    this.knight = this.add(
      new AnimatedSprite2D({
        animations: {
          // frames(prefix) 按名字里的数字排序：hero_attack_01 … hero_attack_05
          idle: { frames: sheet.frames('hero_idle_'), fps: KNIGHT.idle.fps },
          attack: { frames: sheet.frames('hero_attack_'), durations: KNIGHT.attack.durations, loop: false },
        },
        autoplay: true,
        position: v(375, 1000),
      }),
    )
    this.knight.animationFinished.connect(() => this.knight.play('idle'), this)
  }
}
// #endregion

// #region test
import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('texturepacker sequence', async () => {
  const g = await createTestGame({ main: Arena })
  const knight = g.scene.knight
  // 裁掉的透明边各不相同，但尺寸都是导出时的画布 128×128：以画布中心对齐，切换动作时角色不会跳
  const sizes = new Set(Arena.assets.knight.names.map((n) => `${Arena.assets.knight.get(n).width}×${Arena.assets.knight.get(n).height}`))
  expect([...sizes]).toEqual(['128×128'])

  knight.play('attack')
  const hitAt = knight.getFrameTime('attack', KNIGHT.attack.hitFrame)
  expect(hitAt).toBeCloseTo(0.3)
  g.stepSeconds(hitAt + 0.01)
  expect(knight.texture?.path).toBe('knight.png#hero_attack_03.png')
  g.stepSeconds(0.3)
  expect(knight.animation).toBe('idle')
})
// #endregion
