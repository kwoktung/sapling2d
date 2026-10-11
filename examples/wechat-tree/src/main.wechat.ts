import { ColorRect, Node2D, Scene, sfx, Sprite2D, tex, Timer, v, type LoadingScreen } from 'sapling2d'
import { startGame } from 'sapling2d/wechat'

/** 启动页：图片在 public/assets/boot/（主包），资源分包下载期间显示进度。 */
class Splash extends Scene implements LoadingScreen {
  static override assets = { logo: tex('boot/logo.png') }
  fill!: ColorRect
  shownAt = 0

  override ready() {
    this.shownAt = this.tree.time
    this.add(new Sprite2D({ texture: Splash.assets.logo, position: v(375, 560) }))
    const track = this.add(new ColorRect({ position: v(175, 700), size: v(400, 12), color: 0x333333 }))
    this.fill = track.add(new ColorRect({ size: v(400, 12), color: 0xffcc33 }))
  }

  override process() {
    this.fill.scale = v(this.tree.loadProgress, 1)
  }

  async loaded() {
    console.log(`[sapling2d] assets ready after ${(this.tree.time - this.shownAt).toFixed(2)}s`)
    await this.tree.createTimer(0.5).timeout // 至少看一眼启动页
  }
}

/** 绕圈移动的节点：验证主循环在推进。 */
class Orbiter extends Sprite2D {
  angle = 0
  override process(dt: number) {
    this.angle += dt
    this.position = v(375 + Math.cos(this.angle) * 200, 667 + Math.sin(this.angle) * 200)
  }
}

/** 入口场景：贴图和音效在资源分包里。 */
class Main extends Scene {
  static override assets = { fruit: tex('fruit.png'), pop: sfx('pop.mp3') }

  override ready() {
    this.add(new Node2D({ name: 'Center', position: v(375, 667) }))
    this.add(new Orbiter({ name: 'Orbiter', texture: Main.assets.fruit }))
    const report = this.add(new Timer({ name: 'Report', waitTime: 2, autostart: true }))
    report.timeout.connect(() => {
      const vp = this.tree.viewport
      this.tree.audio.play(Main.assets.pop)
      console.log(`[sapling2d] t=${this.tree.time.toFixed(2)}s frames=${this.tree.processFrames} screen=${vp.screen.width}x${vp.screen.height}@${vp.screen.pixelRatio}`)
      console.log(this.tree.dump())
    }, this)
  }
}

void startGame({ main: Main, loading: Splash }).catch((err: unknown) => console.error(`[sapling2d] startGame failed: ${err instanceof Error ? err.message : String(err)}`))
