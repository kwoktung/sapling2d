import { Node2D, Scene, Timer, v } from 'sapling2d'
import { startGame } from 'sapling2d/wechat'

/** 绕圈移动的节点：验证主循环在推进。 */
class Orbiter extends Node2D {
  angle = 0
  override process(dt: number) {
    this.angle += dt
    this.position = v(375 + Math.cos(this.angle) * 200, 667 + Math.sin(this.angle) * 200)
  }
}

class Main extends Scene {
  override ready() {
    this.add(new Orbiter({ name: 'Orbiter' }))
    const report = this.add(new Timer({ name: 'Report', waitTime: 2, autostart: true }))
    report.timeout.connect(() => {
      const vp = this.tree.viewport
      console.log(`[sapling2d] t=${this.tree.time.toFixed(2)}s frames=${this.tree.processFrames} screen=${vp.screen.width}x${vp.screen.height}@${vp.screen.pixelRatio}`)
      console.log(this.tree.dump())
    }, this)
  }
}

void startGame({ main: Main })
