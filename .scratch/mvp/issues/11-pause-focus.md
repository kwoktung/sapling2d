# 11 — 暂停与前后台

**What to build:** 游戏可以暂停（比如暂停菜单），切到后台时自动暂停，回到前台后不会一下子补算很多物理步。

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] 支持 `tree.paused` 和 `processMode`（`inherit`、`pausable`、`always`），语义和 Godot 一致
- [ ] 暂停时 pausable 节点的 `process` 和 `physicsProcess`、物理世界、Timer 和 Tween 都停止
- [ ] 平台的前后台事件统一触发 `tree.focusChanged`；浏览器上来自 `visibilitychange`
- [ ] 默认行为：切后台时暂停主循环（并通知音频系统挂起）；回到前台时重置时间累加器
- [ ] 无头模式下可以模拟前后台切换，有测试覆盖
