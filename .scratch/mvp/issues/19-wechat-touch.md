# 19 — 微信触摸输入

**What to build:** 在小游戏里点击和拖拽节点，效果和浏览器一致。

**Blocked by:** 17, 06

**Status:** done（2026-10-07）。iOS 真机拖动瞄准、松手投放、点击按钮正常；Android 真机验证通过。

- [x] `wx.onTouchStart`、`onTouchMove`、`onTouchEnd`、`onTouchCancel` 接入统一的 Pointer 输入流，坐标换算到设计坐标，支持多点触控
- [x] 06 的示例在开发者工具里能点中节点、拖动节点
