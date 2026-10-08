// #region example
import { AnimatedSprite2D, atlas, Scene, sheet, Sprite2D, v } from 'sapling2d'
// 打包工具（TexturePacker 等）导出的 JSON 直接 import 进代码；图片放在 public/assets/
import spritesData from './sprites.json'

export class Battle extends Scene {
  static override assets = {
    // 网格图集：一张图切成 4 列 × 2 行，帧号从左到右、从上到下（0–7）
    boom: sheet('explosion.png', { columns: 4, rows: 2 }),
    // 打包图集：按名字取帧，尺寸来自 JSON
    sprites: atlas('sprites.png', spritesData),
  }
  enemy!: Sprite2D
  player!: AnimatedSprite2D<'fly' | 'hurt'>

  override ready() {
    // 图集里的一帧就是普通贴图
    this.enemy = this.add(new Sprite2D({ texture: Battle.assets.sprites.get('enemy_red'), position: v(375, 200) }))

    // 多套动画：名字有类型检查；autoplay 播放第一套（或 animation 指定的那套）
    this.player = this.add(
      new AnimatedSprite2D({
        animations: {
          fly: { frames: Battle.assets.boom.frames(0, 3), fps: 12 }, // loop 默认 true
          hurt: { frames: Battle.assets.boom.frames(4, 7), fps: 12, loop: false },
        },
        autoplay: true,
        position: v(375, 1100),
      }),
    )
  }

  explode(at: Sprite2D) {
    // 一次性特效：播完（不循环）就销毁
    const fx = this.add(new AnimatedSprite2D({ frames: Battle.assets.sprites.frames('explosion_'), fps: 16, loop: false, autoplay: true, position: at.position }))
    fx.animationFinished.connect(() => fx.queueFree(), fx)
    at.queueFree()
  }

  async hit() {
    this.player.play('hurt')
    await this.player.animationFinished // 不循环的动画播完时触发
    this.player.play('fly')
  }
}
// #endregion

// #region test
import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('sprite animation', async () => {
  const g = await createTestGame({ main: Battle })
  g.scene.explode(g.scene.enemy)
  g.step()
  expect(g.dump()).toContain('texture=sprites.png#explosion_1 frame=0 playing=true') // 贴图路径带帧名 / 帧号
  g.stepSeconds(0.25) // 3 帧 × 1/16 秒后播完、销毁
  expect(g.dump()).not.toContain('explosion_')

  void g.scene.hit()
  await Promise.resolve() // 让 hit() 里的 await 先注册监听（游戏里 emit 发生在之后的帧，不需要这一步）
  g.stepSeconds(0.4)
  await new Promise((r) => setTimeout(r, 0)) // await 之后的代码在微任务里执行
  expect([g.scene.player.animation, g.scene.player.isPlaying]).toEqual(['fly', true])
})
// #endregion
