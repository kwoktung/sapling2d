# 0006 — 引擎源码不用 `#private`，用 TS 的 `private _name`

**Status:** Accepted (2026-10-08)

## Context

小游戏构建（`saplingWechat`）的目标是 ES2017。`#private` 是 ES2022 语法，降级后每次 `this.#x` 都变成 WeakMap 查找加品牌检查的辅助函数调用。iOS 小游戏基本没有 JIT，这类调用非常慢。

弹幕压测（`spikes/bullets/REPORT.md`）：iPhone 17 上 500 颗子弹逻辑 26.6 ms/帧、同步 11.7 ms/帧，只有 22 fps。无头基准用 ES2017 编译复现：`--jitless` 下逻辑约慢 3 倍、同步约慢 2 倍。

提高构建目标不可行：微信开发者工具上传时，关掉 “ES6 转 ES5” 后它的语法检查不认识 ES2020（`?.`）；打开的话它会自己再把 `#private` 降级一次。

## Decision

`packages/engine/src` 不使用 `#private` 成员，一律写 TS 的 `private _name`（编译后是普通属性）。`test/no-private-fields.test.ts` 检查这一点。

保留下划线前缀：一部分私有字段是同名公开 getter 的存储（`_position` 对应 `position`），去掉前缀就得另起名字；更重要的是游戏会继承引擎节点，裸名字（`freed`、`speed`）很容易和游戏子类的字段撞名，带 `_` 的几乎不会。

名字和已有的 `@internal` 成员冲突时，私有字段换一个名字（如 `Texture` 的 `_ownResource` 对应 `_resource` getter）。

## Consequences

- 小游戏里私有成员访问和普通属性一样快。
- 私有性只在类型检查时生效：JS 代码和 `Object.values(this)` 能看到这些属性；游戏的子类如果声明同名成员，TypeScript 会报错（“separate declarations of a private property”），纯 JS 子类会静默覆盖。
- 游戏代码不受限制：游戏自己的类用不用 `#private` 由游戏决定（热路径上同样建议不用）。
