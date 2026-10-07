# 02 — Monorepo 脚手架和无头节点树

**What to build:** 搭好工程，并让最小的节点树在无头模式下跑通：测试里能创建一个场景，调用 step 推进若干帧，再通过 dump 看到场景树的状态。

**Blocked by:** None — can start immediately

**Status:** done（2026-10-07）

- [x] 用 pnpm monorepo 搭好 TypeScript（strict）和 Vitest；对外的包名是 `sapling2d`，并预留子路径 `sapling2d/testing`
- [x] 实现 `Node`、`Node2D`、`Scene` 和 `SceneTree`；`this.add(child)` 返回带类型的子节点
- [x] 生命周期按 Godot 的顺序调用：`enterTree`、`ready`（先子后父）、每帧的 `process(dt)`、固定 60Hz 的 `physicsProcess(dt)`，以及移除时的 `exitTree`
- [x] 不可变的 `Vector2` 和 `v(x, y)`；`Node2D` 提供 `position`、`x`、`y`、`rotation`、`rotationDegrees`、`scale`、`visible` 和 `zIndex`
- [x] 提供 HeadlessPlatform；`createTestGame({ main, seed })` 支持 `step(n)`，时间完全由 step 驱动
- [x] 带 seed 的 `rand()`：同一个 seed 得到同样的序列
- [x] `dump()` 输出缩进文本，包含类名、名字和关键属性；`dump({ json: true })` 输出 JSON
- [x] 在核心代码里访问 `window`、`document` 或 `wx` 时，lint 或类型检查会报错
