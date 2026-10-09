# 05 — ColorRect：纯色矩形

**What to build:** 血条、遮罩、转场黑幕都需要纯色矩形，现在只能用贴图拼。新增 `ColorRect` 节点（继承 Node2D）：
`size`、`color`（0xRRGGBB）；原点在左上角（和 Godot 一样，血条改 `scale.x` 就能从左往右缩）。透明度、`modulate`、`zIndex` 和其他 Node2D 一样。

**Blocked by:** None — can start immediately

**Status:** done（2026-10-09）

- [x] `ColorRect` 的 `size`、`color`，可以写在构造参数里、可以补间（`color` 按 RGB 通道补间，`size` 按向量补间）
- [x] 浏览器和小游戏都能渲染，和贴图正确混排（zIndex）；在 `CanvasLayer` 下也能用
- [x] 不设 `hitArea` 时，点击区域就是矩形范围（无头模式下也是）
- [x] `dump` 显示 `size`、`color`
- [x] 大量 ColorRect（例如 20 个血条）不明显增加绘制调用
- [x] `llms.txt` 加示例（血条）

## Comments

**实现（2026-10-09）：**

- `ColorRect`（继承 Node2D）：`size`（Vector2，默认 (0, 0)）、`color`（0xRRGGBB，默认白色，截断到合法范围）、只读的 `rect`。原点在左上角。
- 补间：`color` 加进 `_colorProps`，Tween 按 RGB 通道插值（和 `modulate` 一样）；`size` 是 Vector2，按向量插值。
- 点击：没有 `hitArea` 时用 (0, 0)–size 的矩形，不依赖贴图，无头模式下也能点。
- 渲染：一个 Pixi `Sprite`，贴图是 `Texture.WHITE`，`width` / `height` 设成 size，`tint` = `color` × `selfModulate`（按通道相乘）；`modulate`、`alpha`、`zIndex` 走容器，和其他节点一样。用白色贴图染色而不是 `Graphics`：可以和普通贴图合批，改颜色、大小也不用重建几何。`pixelArt` 时同样打开 `roundPixels`。
- `Node2D` 里的 `clampColor` / `hex` 导出成内部函数，ColorRect 复用。
- 测试：`test/color-rect.test.ts` 6 个（默认值和截断、按通道补间、点击区域和 hitArea 覆盖、dump、渲染同步（白色贴图、左上角、宽高、颜色乘 selfModulate、只在改动后更新、宽高为 0）、子节点和混排、CanvasLayer）。`docs/examples/color-rect.test.ts`（血条和转场黑幕）是 `llms.txt` 的示例；节点清单、dump 表、`CONTEXT.md` 都加了。

**浏览器验证（Chrome，spinblade 页面）：** 包装 WebGL 的 draw 调用计数，然后加 60 个 ColorRect（HUD 里 15 个血条，敌人和地上的刀上各挂 15 个，每个是底色 + 填充两个）：每帧绘制调用 **9 → 9**，没有增加。截图里 HUD 血条从左往右填充，挂在刀上的血条跟着刀旋转。
