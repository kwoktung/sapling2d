# 18 — 微信 Label

**What to build:** `Label` 在小游戏里的排版和浏览器一致。

**Blocked by:** 17, 07

**Status:** ready-for-agent

- [ ] 如果 `measureText` 缺少 `actualBoundingBox*`（见 01 的结论），用 fontSize 估算并补齐
- [ ] 07 的计数 Label 示例在开发者工具里显示正确，与浏览器上的效果对比无明显偏移
- [ ] 支持通过 `wx.loadFont` 加载包内字体（可选，做不到时写进文档）
