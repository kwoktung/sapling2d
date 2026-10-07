# 18 — 微信 Label

**What to build:** `Label` 在小游戏里的排版和浏览器一致。

**Blocked by:** 17, 07

**Status:** ready-for-agent

- [ ] iOS 和 Android 真机的 `measureText` 都没有 `actualBoundingBox*`（实测），用 `fontBoundingBoxAscent/Descent` 补齐；真机上也没有 `letterSpacing`，写进文档
- [ ] 07 的计数 Label 示例在开发者工具里显示正确，与浏览器上的效果对比无明显偏移
- [ ] 支持通过 `wx.loadFont` 加载包内字体（可选，做不到时写进文档）
