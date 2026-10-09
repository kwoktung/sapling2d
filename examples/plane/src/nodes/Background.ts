import { BACKGROUND_SPEED } from '../config'
import { ASSETS } from '../assets'
import { Node2D, Sprite2D, v } from 'sapling2d'

const TILE_W = 750
const TILE_H = 1334

/** 向下滚动的星空：两张上下无缝的图交替，铺满可见区域（宽屏时等比放大）。 */
export class Background extends Node2D {
  private readonly _tiles: Sprite2D[] = []
  private _offset = 0
  private _tileH = TILE_H
  private _left = 0
  private _top = 0

  override ready() {
    for (let i = 0; i < 2; i++) this._tiles.push(this.add(new Sprite2D({ texture: ASSETS.background, centered: false })))
    this._layout()
    this.tree.viewport.resized.connect(() => this._layout(), this)
  }

  override process(dt: number) {
    this._offset = (this._offset + BACKGROUND_SPEED * dt) % this._tileH
    this._tiles[0]!.y = this._top + this._offset
    this._tiles[1]!.y = this._top + this._offset - this._tileH
  }

  private _layout() {
    const r = this.tree.viewport.visibleRect
    const s = Math.max(r.width / TILE_W, r.height / TILE_H)
    this._tileH = TILE_H * s
    this._left = r.left + (r.width - TILE_W * s) / 2
    this._top = r.top
    for (const t of this._tiles) {
      t.scale = v(s, s)
      t.x = this._left
    }
    this.process(0)
  }
}
