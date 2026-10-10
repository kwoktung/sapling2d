import { Node2D, Sprite2D, v, type Curve2D } from 'sapling2d'
import { ASSETS } from '../assets'
import { PATH, Z } from '../config'

/**
 * 怪物路线的预览：沿曲线每隔一段放一个小点，显示一会儿后淡出、删除。
 * 精英和 Boss（`important`）显示整条路线、金色；普通怪只显示前一段、更淡（Battle 还会限制同时只有一条）。
 */
export class PathPreview extends Node2D {
  constructor(path: Curve2D, important: boolean) {
    super({ zIndex: Z.preview, alpha: important ? 0.7 : 0.35 })
    const p = { x: 0, y: 0 }
    const end = important ? path.length : Math.min(path.length, PATH.previewLength)
    for (let d = PATH.previewSpacing; d < end; d += PATH.previewSpacing) {
      path.sample(d, p)
      this.add(new Sprite2D({ texture: ASSETS.dot, position: v(p.x, p.y), selfModulate: important ? 0xffc030 : 0xffe6a0 }))
    }
  }

  override ready() {
    this.createTween().wait(PATH.previewTime).to(this, { alpha: 0 }, PATH.previewFade).call(() => this.queueFree())
  }
}
