# 03 — Signal、queueFree、Groups、Autoload

**What to build:** 节点之间的通信、引用和销毁机制。不靠路径查找也能组织游戏逻辑（见 ADR 0003）。

**Blocked by:** 02

**Status:** done（2026-10-07）

- [x] `Signal<T>` 有类型，支持 `connect`、`disconnect`、`emit` 和 `once`；可以直接 `await signal`，拿到 emit 时的参数
- [x] 节点释放时，自动断开它作为监听方的所有连接
- [x] `queueFree()` 在帧末统一销毁节点（先触发 `exitTree`，再断开信号）；同一帧内调用多次是安全的
- [x] `callDeferred(fn)` 在帧末执行
- [x] Groups：`addToGroup`、`removeFromGroup`、`isInGroup` 和 `tree.getNodesInGroup`；`dump` 输出里显示 groups
- [x] Autoload：注册之后成为全局单例节点，可以通过类型拿到
- [x] 以上全部有无头测试
