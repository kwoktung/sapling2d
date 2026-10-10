import { CanvasLayer, ColorRect, Ease, Label, Node2D, Rect2, Signal, Sprite2D, v, type PointerEvent2D, type Vector2 } from 'sapling2d'
import { ART_SCALE, ASSETS } from '../assets'
import { ULT, Z } from '../config'
import { HERO_KINDS, HEROES, type HeroKind } from '../data/heroes'

const BTN = 150
const NAMES: Record<HeroKind, string> = { archer: '箭雨', mage: '陨石', knight: '冲锋' }

/** 图标贴图 128×128（按 2 倍存），按钮里显示成 BTN - 10。 */
const ICON_SCALE = (BTN - 10) / 128
const BAR_H = 10

/** 一个大招按钮（原点在左上角，BTN × BTN）：大招图标（没充满时变暗）、名字、底下的充能条；充满时发光脉动。没上场的英雄是半透明的。 */
export class UltButton extends Node2D {
  readonly icon: Sprite2D
  /** 充能条（ColorRect 原点在左上角：改 scale.x 从左往右填满）。 */
  readonly fill: ColorRect
  readonly glow: Sprite2D
  /** 0–1。 */
  charge = 0
  placed = false
  /** 充满了、可以放（不叫 ready：那是节点的生命周期方法）。 */
  charged = false
  private _t = 0

  constructor(readonly kind: HeroKind) {
    super({ inputPickable: true, hitArea: new Rect2(0, 0, BTN, BTN) })
    this.glow = this.add(new Sprite2D({ texture: ASSETS.glow, position: v(BTN / 2, BTN / 2), scale: v(3.4, 3.4), selfModulate: 0xffd060, blendMode: 'add', visible: false, zIndex: -1 }))
    this.icon = this.add(new Sprite2D({ texture: ASSETS.ui.get(`icon_ult_${kind}`), position: v(BTN / 2, BTN / 2), scale: v(ICON_SCALE, ICON_SCALE) }))
    this.add(new Label({ text: NAMES[kind], fontSize: 26, fontWeight: 'bold', color: 0xffffff, align: 'center', verticalAlign: 'center', position: v(BTN / 2, BTN - 12), stroke: { color: 0x000000, width: 4 } }))
    const bar = this.add(new ColorRect({ position: v(16, BTN + 2), size: v(BTN - 32, BAR_H), color: 0x1a2028 }))
    this.fill = bar.add(new ColorRect({ size: v(BTN - 32, BAR_H), color: 0x60c0ff }))
  }

  update(placed: boolean, charge: number, charged: boolean): void {
    this.placed = placed
    this.charge = charge
    this.charged = placed && charged
    this.alpha = placed ? 1 : 0.35
    this.fill.scale = v(charge, 1)
    this.fill.color = this.charged ? 0xffc040 : 0x60c0ff
    this.icon.selfModulate = this.charged ? 0xffffff : 0x7a8088
    this.glow.visible = this.charged
  }

  override process(dt: number) {
    if (!this.charged) return
    this._t += dt
    this.glow.alpha = 0.45 + 0.35 * Math.sin(this._t * 6)
  }
}

/**
 * 屏幕底部的大招栏。操作：
 * - 弓手（箭雨）：按住按钮拖到场上，松手释放；拖回按钮上松手就取消；
 * - 法师（陨石）：点按钮进入选点模式（`aiming`），再点场上释放；再点一次按钮取消；
 * - 骑士（冲锋）：点按钮直接释放。
 * 只发信号，释放和目标圈由 Battle 处理；位置是设计坐标（这一层不跟相机走）。
 */
export class UltBar extends CanvasLayer {
  readonly buttons: Record<HeroKind, UltButton>
  /** 开始选目标（弓手按下、法师点按钮）、目标移动、结束（位置为 null 表示取消）。 */
  readonly aimStart = new Signal<[kind: HeroKind]>()
  readonly aimMove = new Signal<[kind: HeroKind, at: Vector2]>()
  readonly aimEnd = new Signal<[kind: HeroKind, at: Vector2 | null]>()
  /** 骑士冲锋这类不用选目标的。 */
  readonly cast = new Signal<[kind: HeroKind]>()
  /** 选点模式下接住场上点击的全屏层（法师）。 */
  readonly catcher: ColorRect
  aiming: HeroKind | null = null

  constructor() {
    super({ name: 'UltBar', layer: 12 })
    this.buttons = { archer: new UltButton('archer'), mage: new UltButton('mage'), knight: new UltButton('knight') }
    this.catcher = new ColorRect({ name: 'AimCatcher', color: 0x000000, alpha: 0.001, inputPickable: true, visible: false, zIndex: -10 })
  }

  override ready() {
    const r = this.tree.viewport.visibleRect
    this.catcher.position = r.position
    this.catcher.size = r.size
    this.add(this.catcher)
    this.catcher.pointerDown.connect((e) => this._catcherDown(e), this)
    this.catcher.pointerMove.connect((e) => this.aimMove.emit('mage', e.position), this)
    this.catcher.pointerUp.connect((e) => this._catcherUp(e), this)
    for (const kind of HERO_KINDS) {
      const b = this.add(this.buttons[kind])
      if (kind === 'archer') {
        b.pointerDown.connect(() => this._archerDown(), this)
        b.pointerMove.connect((e) => this.aiming === 'archer' && this.aimMove.emit('archer', e.position), this)
        b.pointerUp.connect((e) => this._archerUp(b, e), this)
      } else {
        b.clicked.connect(() => this._tap(kind), this)
      }
    }
    this._layout()
    this.tree.viewport.resized.connect(() => this._layout(), this)
  }

  /** 取消正在选的目标（升级弹窗出现、英雄被拖走等）。 */
  cancelAim(): void {
    const kind = this.aiming
    if (!kind) return
    this.aiming = null
    this.catcher.visible = false
    this.aimEnd.emit(kind, null)
  }

  private _archerDown() {
    if (!this.buttons.archer.charged || this.aiming) return
    this.aiming = 'archer'
    this.aimStart.emit('archer')
  }

  private _archerUp(b: UltButton, e: PointerEvent2D) {
    if (this.aiming !== 'archer') return
    this.aiming = null
    // 松在按钮上：取消
    this.aimEnd.emit('archer', b.hitTest(b.toLocal(e.position)) ? null : e.position)
  }

  private _tap(kind: HeroKind) {
    const b = this.buttons[kind]
    if (kind === 'mage') {
      if (this.aiming === 'mage') return this.cancelAim()
      if (!b.charged || this.aiming) return
      this.aiming = 'mage'
      this.catcher.visible = true
      this.aimStart.emit('mage')
      return
    }
    if (b.charged && !this.aiming) this.cast.emit(kind)
  }

  private _catcherDown(e: PointerEvent2D) {
    if (this.aiming === 'mage') this.aimMove.emit('mage', e.position)
  }

  private _catcherUp(e: PointerEvent2D) {
    if (this.aiming !== 'mage') return
    this.aiming = null
    this.catcher.visible = false
    this.aimEnd.emit('mage', e.position)
  }

  private _layout() {
    const r = this.tree.viewport.safeRect
    const gap = (r.width - BTN * 3) / 4
    HERO_KINDS.forEach((k, i) => (this.buttons[k].position = v(r.left + gap + i * (BTN + gap), r.bottom - BTN - 18)))
  }
}

/** 选目标时场上的目标圈（世界坐标）。 */
export class AimRing extends Sprite2D {
  constructor() {
    super({ texture: ASSETS.range, visible: false, zIndex: Z.fx, selfModulate: 0xffd060 })
  }

  showAt(x: number, y: number, radius: number): void {
    const s = (radius * 2) / 256
    this.scale = v(s, s)
    this.x = x
    this.y = y
    this.visible = true
  }
}

/**
 * 箭雨区域：`time` 秒内每隔一段落一轮（回调 `volley(x, y, radius)` 结算伤害），每轮画几支从天而降的箭；结束后淡出删除。
 */
export class RainZone extends Node2D {
  private _left: number
  private _next = 0
  private _fired = 0

  constructor(
    x: number,
    y: number,
    private readonly radius: number,
    private readonly volley: (x: number, y: number, radius: number) => void,
    private readonly randf: (from: number, to: number) => number,
  ) {
    super({ position: v(x, y), zIndex: Z.fx })
    this._left = ULT.rain.time
    const s = (radius * 2) / 256
    this.add(new Sprite2D({ texture: ASSETS.range, scale: v(s, s), selfModulate: 0x9fe0a0, alpha: 0.8 }))
  }

  override process(dt: number) {
    if (this._fired >= ULT.rain.volleys) return
    this._left -= dt
    this._next -= dt
    while (this._next <= 0 && this._fired < ULT.rain.volleys) {
      this._next += ULT.rain.time / ULT.rain.volleys
      this._fired++
      this.volley(this.x, this.y, this.radius)
      for (let i = 0; i < 4; i++) this._arrow()
    }
    if (this._fired >= ULT.rain.volleys) this.createTween().wait(0.2).to(this, { alpha: 0 }, 0.3).call(() => this.queueFree())
  }

  get volleysFired(): number {
    return this._fired
  }

  /** 一支落下的箭：从上方斜着落到圈里的随机一点。 */
  private _arrow() {
    const a = this.randf(0, Math.PI * 2)
    const r = Math.sqrt(this.randf(0, 1)) * this.radius
    const tx = Math.cos(a) * r
    const ty = Math.sin(a) * r * 0.6
    const arrow = this.add(new Sprite2D({ texture: ASSETS.fx.get('fx_arrow'), position: v(tx + 60, ty - 220), rotation: Math.PI + 0.26, scale: v(ART_SCALE * 1.2, ART_SCALE * 1.2) }))
    arrow.createTween().to(arrow, { position: v(tx, ty) }, 0.12).call(() => arrow.queueFree())
  }
}

/** 陨石：目标圈收缩、一团火从天上落下，`delay` 秒后回调 `land(x, y)` 爆炸，然后删除自己。 */
export class MeteorStrike extends Node2D {
  private readonly _ring: Sprite2D
  private readonly _rock: Sprite2D
  private readonly _ringScale: number

  constructor(
    x: number,
    y: number,
    radius: number,
    private readonly land: (x: number, y: number) => void,
  ) {
    super({ position: v(x, y), zIndex: Z.fx })
    this._ringScale = (radius * 2) / 256
    const s = this._ringScale
    this._ring = this.add(new Sprite2D({ texture: ASSETS.range, scale: v(s * 1.3, s * 1.3), selfModulate: 0xff6040 }))
    this._rock = this.add(new Sprite2D({ texture: ASSETS.fx.get('fx_fireball'), position: v(-140, -700), scale: v(1.2, 1.2), blendMode: 'add' }))
  }

  override ready() {
    const s = this._ringScale
    this._ring.createTween().to(this._ring, { scale: v(s, s) }, ULT.meteor.delay, Ease.QuadIn)
    this._rock.createTween().to(this._rock, { position: v(0, 0), rotation: 8 }, ULT.meteor.delay, Ease.QuadIn).call(() => {
      this.land(this.x, this.y)
      this.queueFree()
    })
  }
}
