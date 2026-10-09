# 06 — Particles2D：精简版粒子

**What to build:** 刀碰撞的火花、击杀时的碎片。新增 `Particles2D` 节点，参数保持最小：

- 一张贴图（可以是图集里的一帧）；
- 一次性爆发（`emit(count)` 或 `oneShot`）和持续发射（每秒数量）；
- 生命周期、初速度和方向扩散角、速度随机范围、重力；
- 随生命周期变化的缩放和透明度（起始值 → 结束值）。

粒子不是节点：数据存在节点内部的数组里，模拟在 `process` 里做，渲染层批量绘制（Pixi 的 `ParticleContainer` 或同等做法）。
随机数用 `tree.rng`，无头测试可复现。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 爆发和持续发射；`emitting`、`amount`（同时存活上限）；全部粒子结束时发出信号（方便 `queueFree`）
- [ ] 粒子坐标：发射时继承节点的全局位置，之后不随节点移动（火花不跟着角色走）
- [ ] 受 `tree.timeScale`（04）和暂停影响
- [ ] 每帧不分配内存；粒子数据预先分配，达到上限时不再发射
- [ ] 无头模式下照常模拟（不渲染），`dump` 显示存活粒子数；测试可以检查数量和生命周期
- [ ] iPhone 真机：同屏 500 个粒子时记录每帧逻辑和渲染耗时
- [ ] `examples/plane` 的爆炸改用它（验证接口在第二个游戏里也合适）
- [ ] `llms.txt` 加示例
