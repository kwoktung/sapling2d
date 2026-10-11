import { Scene } from '../core/Scene'
import { v } from '../math/Vector2'
import { ColorRect } from '../nodes/ColorRect'

const BAR_HEIGHT = 8

/**
 * 内置的启动页：屏幕中间一条进度条，不用任何资源。启动参数没有传 `loading` 时使用。
 * 背景就是渲染器的背景色（启动参数 `background`）。
 */
export class DefaultLoadingScene extends Scene {
  private _fill: ColorRect | null = null

  override ready(): void {
    const r = this.tree.viewport.designRect
    const width = Math.round(r.width * 0.6)
    const track = this.add(
      new ColorRect({ name: 'Track', position: v(r.x + (r.width - width) / 2, r.y + r.height / 2 - BAR_HEIGHT / 2), size: v(width, BAR_HEIGHT), color: 0x404040 }),
    )
    this._fill = track.add(new ColorRect({ name: 'Fill', size: v(width, BAR_HEIGHT), color: 0xffffff }))
    this._update()
  }

  override process(): void {
    this._update()
  }

  private _update(): void {
    const p = this.tree.loadProgress
    if (this._fill && this._fill.scale.x !== p) this._fill.scale = v(p, 1)
  }
}
