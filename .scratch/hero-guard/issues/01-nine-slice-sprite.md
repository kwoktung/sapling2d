# 01 — 引擎：`NineSliceSprite`

**What to build:** 九宫格节点，给界面边框用（三选一卡片、按钮、对话框、血条框）：一张边框贴图按四个边距切成 9 块，四角不缩放，四边单向拉伸，中间双向拉伸，拉成任意 `size`。参照 Godot 的 `NinePatchRect`，包 Pixi v8 自带的 `NineSliceSprite`。

```ts
const card = new NineSliceSprite({ texture: UI.get('panel_wood'), margins: { left: 24, top: 24, right: 24, bottom: 24 }, size: v(560, 200) })
```

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `NineSliceSprite`（继承 Node2D）：`texture`、`margins`（`left` / `top` / `right` / `bottom`，像素，按贴图原始尺寸）、`size`；原点在**左上角**（和 `ColorRect` 一样，界面布局方便）。都能在构造参数里写、都能改；`size` 能补间
- [ ] 图集的帧（含裁掉透明边的帧）也能用；贴图还没加载时不显示、不报错
- [ ] `modulate` / `selfModulate` / `alpha` / `blendMode` 照常生效（`flash` 只有 `Sprite2D` 有，九宫格不支持）；没有 `hitArea` 时点击区域就是 `(0, 0)–size` 的矩形（无头模式下也是），所以能直接当按钮
- [ ] 边距之和超过 `size` 时的行为写清楚（Pixi 的处理或截断），不崩
- [ ] `dump` 显示 `texture`、`size`、`margins`（非默认时）
- [ ] 渲染同步测试（写到 Pixi 的 `NineSliceSprite` 上的值）、属性测试；`docs/examples/nine-slice.test.ts`，llms.txt 新增一节和节点清单一行；`pnpm check` 通过
- [ ] 浏览器里看一次拉伸效果（四角不变形）

## Comments
