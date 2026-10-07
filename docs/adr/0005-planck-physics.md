# 0005 — 物理引擎选用 planck.js，替代 matter.js

**Status:** Accepted (2026-10-07)

## Context

最初计划使用 matter.js 0.20，但它自 2024-06 起没有发布新版本，没有原生运动学刚体（issue #498，2017 年至今未关闭），没有真正的 CCD，堆叠也偏软、会抖动。候选方案：

- planck.js 1.5.0：纯 TS，约 47 KB（gz）
- Rapier 2D 0.21：WASM，约 0.7–0.9 MB
- box2d3-wasm 5.2：WASM，约 120 KB（brotli）

微信只提供 `WXWebAssembly`：`instantiate` 只接受包内的 .wasm 文件路径，不接受字节。真机上缺少 TextDecoder。iOS 普通模式下 JS 和 WASM 都没有 JIT。

## Decision

- 选用 **planck.js**。原因：
  - 有原生 static、kinematic、dynamic 三类刚体，支持 bullet/CCD、传感器、过滤位和接触事件
  - 圆形堆叠稳定
  - 自带 TS 类型
  - 在小游戏里不需要任何补丁
- planck 只封装在引擎内部的 `physics/` 模块里；**不**做可插拔的物理后端接口，节点 API 本身就是抽象层（见 ADR 0002）。
- 内部按 `pixelsPerMeter`（默认 50）换算像素和米。
- `physics/` 模块为 kinematic 类型预留位置，以后可以加 `AnimatableBody2D` / `CharacterBody2D`。MVP 不包含这两个节点。
- 小游戏模板默认开启 `iOSHighPerformance: true`，在 M0 中对比普通模式和高性能模式。

## Consequences

- Rapier 和 box2d3-wasm 保留为以后的选项：如果需要跨平台确定性（lockstep、回放）或者大规模刚体场景，只替换 `physics/` 模块即可。
- 确定性只保证同一个 JS 引擎内一致，不保证跨平台。这已经满足 Headless 测试的需求。
- Character controller 以后需要基于 kinematic 刚体加 rayCast 自行实现。

## Update (2026-10-07, ticket 09)

- 碰撞层：32 位可用（planck 用 `(a & b) !== 0` 判断，第 32 层的符号位不影响）。
- 碰撞层规则改为 Godot 语义（任一方 mask 包含对方 layer 即碰撞），通过覆写每个 fixture 的 `shouldCollide` 实现；Box2D 原生的 category/mask 不再使用。
- Area2D 用 kinematic 刚体 + sensor fixture 实现，因此检测不到静态刚体和其他 Area2D（Box2D 只为至少含一个 dynamic 的刚体对生成接触）。
