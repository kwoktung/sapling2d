# 0003 — 继承式节点树；不支持路径查找

**Status:** Accepted (2026-10-07)

## Decision

- 采用 Godot 式继承节点树（非 ECS / 组件）。
- 场景用代码定义：`Scene` 子类 + `static assets` 声明资源 + `ready()` 中 `this.add(new X({...}))`（参考 Phaser 4 Scene 的 preload/create 分工）。
- 节点引用：类型化字段、Groups、Autoload。**不**提供 `getNode("Path")` / `%Unique`。
- 场景切换使用类引用和类型化参数，不使用字符串 key。

## Consequences

- 引用关系全部可被 TypeScript 检查，对 agent 友好；重命名节点不会破坏引用。
- 无法像 Godot 那样从外部按路径临时取节点，需显式暴露字段或使用 Group。
