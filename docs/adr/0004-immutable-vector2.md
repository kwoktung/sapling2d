# 0004 — 不可变 Vector2

**Status:** Accepted (2026-10-07)

## Context

Godot 的 `Vector2` 是值类型；TypeScript 中对象为引用，可变向量会产生别名问题，且 `node.position.x += 1` 无法可靠触发脏标记。

## Decision

`Vector2` 不可变，所有运算返回新实例。修改通过重新赋值（`node.position = ...`），并提供 `node.x` / `node.y` 快捷属性。

## Consequences

- 无别名 bug，脏标记可靠。
- 比 Godot 写法略啰嗦；小规模 2D 游戏的分配开销可接受。
