# 01 — 引擎：`NineSliceSprite`

**What to build:** 九宫格节点，给界面边框用（三选一卡片、按钮、对话框、血条框）：一张边框贴图按四个边距切成 9 块，四角不缩放，四边单向拉伸，中间双向拉伸，拉成任意 `size`。参照 Godot 的 `NinePatchRect`，包 Pixi v8 自带的 `NineSliceSprite`。

```ts
const card = new NineSliceSprite({ texture: UI.get('panel_wood'), margins: { left: 24, top: 24, right: 24, bottom: 24 }, size: v(560, 200) })
```

**Blocked by:** None — can start immediately

**Status:** done（2026-10-10）

- [x] `NineSliceSprite`（继承 Node2D）：`texture`、`margins`（`left` / `top` / `right` / `bottom`，像素，按贴图原始尺寸）、`size`；原点在**左上角**（和 `ColorRect` 一样，界面布局方便）。都能在构造参数里写、都能改；`size` 能补间
- [x] 图集的帧（含裁掉透明边的帧）也能用；贴图还没加载时不显示、不报错
- [x] `modulate` / `selfModulate` / `alpha` / `blendMode` 照常生效（`flash` 只有 `Sprite2D` 有，九宫格不支持）；没有 `hitArea` 时点击区域就是 `(0, 0)–size` 的矩形（无头模式下也是），所以能直接当按钮
- [x] 边距之和超过 `size` 时的行为写清楚（Pixi 的处理或截断），不崩
- [x] `dump` 显示 `texture`、`size`、`margins`（非默认时）
- [x] 渲染同步测试（写到 Pixi 的 `NineSliceSprite` 上的值）、属性测试；`docs/examples/nine-slice.test.ts`，llms.txt 新增一节和节点清单一行；`pnpm check` 通过
- [x] 浏览器里看一次拉伸效果（四角不变形）

## Comments

**实现（2026-10-10）：**

- `src/nodes/NineSliceSprite.ts`：`texture`、`margins`（对象或一个数字，冻结；负数和非有限数报错）、`size`、`rect`、`hitTest`（没有 `hitArea` 时是 `(0, 0)–size`）、`dump`（四边相同时显示一个数字，不同时 `1,2,3,4`，0 时省略）。
- 渲染：`NodeContent` 加 `NineSliceContent`，包 Pixi 的 `NineSliceSprite`（`import 'pixi.js/sprite-nine-slice'` 注册渲染管线，和粒子容器一样）；锚点保持 (0, 0)，原点在左上角。Pixi 的九宫格按贴图的 `orig` 算边距、支持 `trim`，所以图集里裁掉透明边的帧也对；`size` 小于边距之和时 Pixi 按比例缩小四角。
- `margins` 的单位按“贴图裁剪前的原始尺寸”，和 Pixi 一致。
- 测试：渲染同步（写到 Pixi 的值、裁边帧的原始尺寸、改尺寸和边距）、点击区域、`dump`、报错、`size` 补间；`docs/examples/nine-slice.test.ts` + `ui.json`；llms.txt 新增“九宫格”一节和节点清单一行。
- 浏览器（Chrome）：用灰盒原型的圆形槽位图（100×100、边距 40）拉成 560×140 和 120×300，四角保持圆弧、描边粗细不变，`selfModulate` 染色正常；对照的普通精灵直接拉伸成了椭圆。
