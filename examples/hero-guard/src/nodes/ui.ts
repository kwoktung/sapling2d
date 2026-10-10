import { Label, NineSliceSprite, v, type NineSliceSpriteOptions, type Vector2 } from 'sapling2d'
import { ASSETS } from '../assets'

/** 木框边框（羊皮纸中间）的花边宽度，按贴图像素（贴图 201×200）。 */
const PANEL_MARGIN = 40
/** 绿色按钮：左右是圆角，上面是高光、下面是深色的底边（贴图 220×100）。 */
const BUTTON_MARGINS = { left: 34, top: 34, right: 34, bottom: 26 }

/** 羊皮纸上的字：深棕色。 */
export const INK = 0x4a2a12
export const INK_SOFT = 0x6a4a2a

/** 木框面板（卡片、结束画面）的参数：原点在左上角。卡片类继承 NineSliceSprite 时传给 super。 */
export function panelOptions(size: Vector2, extra: NineSliceSpriteOptions = {}): NineSliceSpriteOptions {
  return { texture: ASSETS.ui.get('ui_panel'), margins: PANEL_MARGIN, size, ...extra }
}

/** 绿色按钮，文字居中。原点在左上角。 */
export function button(text: string, size: Vector2): NineSliceSprite {
  const b = new NineSliceSprite({ texture: ASSETS.ui.get('ui_button'), margins: BUTTON_MARGINS, size, inputPickable: true })
  b.add(new Label({ text, fontSize: 40, fontWeight: 'bold', color: 0xffffff, align: 'center', verticalAlign: 'center', position: v(size.x / 2, size.y / 2 - 4), stroke: { color: 0x1a4a10, width: 5 } }))
  return b
}
