# 0007 — 在 planck 之外提供只做命中判定的 HitTester

**Status:** Accepted (2026-10-09)

## Context

ADR 0005 规定物理只用 planck，并且只封装在 `physics/` 里。但弹幕类游戏同时有几百颗子弹：iOS 小游戏没有 JIT，同时活跃的刚体建议在 60–80 个以内（`spikes/bullets/REPORT.md`），子弹用 `RigidBody2D` / `Area2D` 会超出预算。这些对象也不需要物理反应，只需要知道“碰没碰到”。`examples/plane` 因此自己写了一套圆形判定。

## Decision

引擎提供 `HitTester`（`physics/HitTester.ts`），作为 planck 之外的轻量选项，而不是第二个物理引擎：

- 只做判定，没有物理反应、不发信号、不是节点；游戏在 `process` 里主动调用 `forEachHit(as, bs, hit)`，分组靠游戏自己维护的数组。
- 形状复用 `circle()` / `rectangle()`，对象通过 `hitShape` 字段声明。只支持圆和轴对齐矩形，不随 rotation / scale 变化，比较局部坐标；多边形、旋转、多形状仍然交给 `Area2D`。
- 形状是带类型的数据，内层循环按类型组合分支，只做算术，不调用方法、不分配内存。

## Consequences

- 碰撞有两条路：要物理反应或复杂形状用 planck 节点；大量简单对象只问命中用 `HitTester`。`llms.txt` 的性能一节写明了怎么选。
- 两组对象的坐标系由游戏保证（同一个父节点）；放错层不会报错，只会判定错。
- 复杂度是 O(n × m)。几百 × 几百时可以在内部加网格分桶，接口不变。
