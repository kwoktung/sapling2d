import { Node2D, Sprite2D, v, type Curve2D } from 'sapling2d'
import { ASSETS } from '../assets'
import { PATH, Z } from '../config'

/** 怪物路线的预览：沿曲线每隔一段放一个小点，显示一会儿后淡出、删除。怪物出现时创建一次。 */
export class PathPreview extends Node2D {
  constructor(path: Curve2D) {
    super({ zIndex: Z.preview, alpha: 0.55 })
    const p = { x: 0, y: 0 }
    for (let d = PATH.previewSpacing; d < path.length; d += PATH.previewSpacing) {
      path.sample(d, p)
      this.add(new Sprite2D({ texture: ASSETS.dot, position: v(p.x, p.y), selfModulate: 0xffe6a0 }))
    }
  }

  override ready() {
    this.createTween().wait(PATH.previewTime).to(this, { alpha: 0 }, PATH.previewFade).call(() => this.queueFree())
  }
}
