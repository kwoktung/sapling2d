// #region example
import { ColorRect, Scene, Sprite2D, tex, v, type LoadingScreen } from 'sapling2d'

/** 启动页：logo + 进度条，至少显示 1 秒。资源放在 public/assets/boot/（微信小游戏里留在主包）。 */
export class Splash extends Scene implements LoadingScreen {
  static override assets = { logo: tex('boot/logo.png') }
  fill!: ColorRect

  override ready() {
    this.add(new Sprite2D({ texture: Splash.assets.logo, position: v(375, 560) }))
    const track = this.add(new ColorRect({ position: v(175, 760), size: v(400, 12), color: 0x333333 }))
    this.fill = track.add(new ColorRect({ size: v(400, 12), color: 0xffcc33 }))
  }

  override process() {
    this.fill.scale = v(this.tree.loadProgress, 1) // 0..1，微信上包括下载资源分包
  }

  // 可选：资源都加载完后调用，返回的 Promise 完成后才切到入口场景
  async loaded() {
    await this.tree.createTimer(1).timeout
  }
}

export class Menu extends Scene {
  static override assets = { bg: tex('bg.png') }
}

// main.ts：startGame({ main: Menu, loading: Splash })
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('loading screen', async () => {
  // #region test
  // 测试里启动页直接被跳过（不经过帧，不等 loaded()）；测启动页本身就把它当作 main
  const g = await createTestGame({ main: Menu, loading: Splash })
  expect(g.scene).toBeInstanceOf(Menu)
  const splash = await createTestGame({ main: Splash })
  splash.step()
  expect(splash.scene.fill.scale.x).toBe(1) // 没在加载时 loadProgress 是 1
  // #endregion
})
