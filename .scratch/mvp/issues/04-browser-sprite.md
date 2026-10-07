# 04 — 浏览器上屏：Sprite2D

**What to build:** 在浏览器里用 Vite 运行一个示例场景，`Sprite2D` 显示在固定尺寸的画布上，节点变换的变化会同步到画面（见 ADR 0002）。

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] BrowserPlatform 提供 canvas、`now()`、rAF 和图片加载
- [ ] 渲染同步：节点首次进入有渲染器的树时，才懒创建 Pixi 对象；带脏标记的 transform、visible 和 zIndex 每帧同步过去；节点移除时销毁对应的 Pixi 对象
- [ ] 用户 API 不暴露 Pixi 对象，只提供 `unsafePixi` 作为逃生口
- [ ] `Sprite2D` 支持 texture、`centered`（默认 true）和 `offset`
- [ ] 在 `static assets` 里声明的资源（`tex(...)`）会在进入场景前加载完成，`ready()` 里可以直接用
- [ ] 无头模式下 `Sprite2D` 不创建渲染对象，但 `dump` 里能看到它
- [ ] 有一个用 Vite 开发服务器运行的示例：一个旋转的精灵
