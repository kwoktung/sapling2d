# 0002 — 节点自持数据，渲染时同步到 Pixi；物理以 planck 为权威

**Status:** Accepted (2026-10-07)

## Context

引擎需要支持无头（Headless）确定性测试，且不希望用户代码与 Pixi / planck 原生对象耦合。

## Decision

- `Node2D` 自持变换数据；渲染层每帧把脏节点同步到懒创建的 Pixi 显示对象。Headless 模式不创建渲染器。
- `RigidBody2D` 以 planck body 为权威：每物理步后写回节点；用户设置 `position` 等同瞬移并清除速度。
- 不暴露 Pixi / planck 原生对象，仅提供 `unsafePixi` 逃生口。
- 物理固定 60Hz 步进 + 时间累加器，由引擎驱动 `world.step`；回到前台时重置累加器。

## Consequences

- 节点树与物理可在 Node（Vitest）中无渲染运行。
- 每个可视节点需实现到 Pixi 的同步代码，有一次性开销。
- 将来替换渲染器的成本可控。
