# 0001 — 微信小游戏采用最小适配，不使用全局 polyfill

**Status:** Accepted (2026-10-07)

## Context

PixiJS v8 提供 `DOMAdapter`（9 个方法）抽象，但 Pixi 在 Adapter 之外仍直接使用 `requestAnimationFrame`、`performance`、`document` / `window`（EventSystem）、`canvas.addEventListener`（GlContextSystem）、动态 `import()`（browserAll），且依赖 `new Function`（需 `pixi.js/unsafe-eval`）。社区现有方案均为 weapp-adapter 式全局 polyfill，没有维护中的 v8 适配包。

## Decision

- `DOMAdapter.set(WechatAdapter)` 只实现 Pixi 要求的 9 个方法，另补 rAF、`performance`（`wx.getPerformance().now()` 微秒 → 毫秒）、canvas `addEventListener` stub、`WebGLRenderingContext` 构造器。
- 强制 `import 'pixi.js/unsafe-eval'`，`skipExtensionImports: true`，手动导入所需模块。
- **不使用 Pixi EventSystem**：引擎自行将 `wx.onTouch*` 与浏览器 pointer 事件统一为输入流，自行做命中测试。
- 资源加载：`preferCreateImageBitmap: false`、`preferWorkers: false`、`skipDetections: true`；WeChat 图片/canvas 显式构造 `ImageSource` / `CanvasSource`。
- 最低基础库 ≥ 2.25；仅 WebGL1（`preference: 'webgl'`）。

## Consequences

- 平台边界清晰、可控，故障可定位；引擎自管输入同时服务于无头确定性测试（可注入输入）。
- 需要自行实现命中测试与 `fetch` Response shim。
- `measureText` 是否返回 `actualBoundingBox*` 未知，需在 M0 spike 真机验证，必要时 polyfill。
