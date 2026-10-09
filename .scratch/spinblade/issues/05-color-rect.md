# 05 — ColorRect：纯色矩形

**What to build:** 血条、遮罩、转场黑幕都需要纯色矩形，现在只能用贴图拼。新增 `ColorRect` 节点（继承 Node2D）：
`size`、`color`（0xRRGGBB）；原点在左上角（和 Godot 一样，血条改 `scale.x` 就能从左往右缩）。透明度、`modulate`、`zIndex` 和其他 Node2D 一样。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `ColorRect` 的 `size`、`color`，可以写在构造参数里、可以补间（`color` 按 RGB 通道补间，`size` 按向量补间）
- [ ] 浏览器和小游戏都能渲染，和贴图正确混排（zIndex）；在 `CanvasLayer` 下也能用
- [ ] 不设 `hitArea` 时，点击区域就是矩形范围（无头模式下也是）
- [ ] `dump` 显示 `size`、`color`
- [ ] 大量 ColorRect（例如 20 个血条）不明显增加绘制调用
- [ ] `llms.txt` 加示例（血条）
