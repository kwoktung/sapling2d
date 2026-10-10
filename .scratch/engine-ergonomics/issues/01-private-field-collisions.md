# 01 — 引擎私有字段的名字会和游戏子类的字段冲突

**What to build:** 游戏继承引擎节点时，子类里的字段如果和引擎类的私有字段同名，TypeScript 直接报错（同名私有成员不兼容）；更糟的是用 JavaScript 或类型没对上时，运行时会互相覆盖。hero-guard 里已经撞了三次：

- `Sprite2D` 新加的 `_flash` 和 `examples/plane` 里 Boss / Enemy 自己的 `_flash`（引擎改名 `_flashAmount`）；
- `Enemy` 的 `_scale` 和 `Node2D` 的私有 `_scale`（游戏改名 `_sizeScale`）——运行时把 `Node2D` 的缩放覆盖成了数字；
- `UltButton` 的 `ready` 字段和节点的生命周期方法 `ready()`（公开方法，不算私有字段，但同一类问题：常用名被基类占了）。

`_scale`、`_texture`、`_size` 这类名字游戏代码很容易用到，以后还会撞。

**Blocked by:** None

**Status:** needs-triage

需要决定怎么处理：

- (a) **引擎私有字段统一加前缀**（例如 `_n2d_scale`、`__scale`）：最直接，改动面大，但都是内部字段；ADR 0006 不让用 `#private`（iOS 小游戏上慢 2–3 倍），这是能避开冲突的替代办法。
- (b) **只改最容易撞的那些**（`_scale`、`_texture`、`_size`、`_color`……），其余不动。
- (c) **只写进 llms.txt 的常见陷阱**：“子类字段不要用下划线 + 常见名”，不改引擎。

另外，`ready` / `process` 这类生命周期方法名被字段占用时的报错信息不直观（“Property 'ready' … is not assignable”），也可以在 llms.txt 里提一句。

## Comments
