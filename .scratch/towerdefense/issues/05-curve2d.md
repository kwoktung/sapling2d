# 05 — 引擎：曲线路径（`Curve2D`）

**What to build:** 原型验证出来的 P1：怪物的随机曲线路径在游戏里写了 114 行，还踩了 uniform Catmull-Rom 出尖角的坑（约 5% 的随机路径）。把“样条 + 按弧长取点”放进引擎，做对一次。

**Blocked by:** 01

**Status:** done（2026-10-10）

- [x] `Curve2D.catmullRom(points, { closed?, bakeInterval? })`（centripetal）和 `Curve2D.polyline(points, { closed? })`；控制点接受任何带 `x` / `y` 的对象
- [x] `length`、`sample(distance, out)`（不分配）、`angleAt(distance)`；开放曲线停在端点，闭合曲线绕回
- [x] 相邻重复点自动去掉；点不够、非有限数、`bakeInterval` 不合法时报错
- [x] 测试：经过控制点、按弧长等距、随机路径不出尖角、闭合时首尾平滑、烘焙精度收敛；`docs/examples/curve.test.ts`，`llms.txt` 新增“曲线路径”小节和节点清单一行
- [x] 塔防原型改用 `Curve2D`，`src/path.ts` 只剩生成随机控制点

## Comments

**实现（2026-10-10）：**

- `src/math/Curve2D.ts`：创建时烘焙成折线（每段先用 8 个点粗估弧长，再按 `bakeInterval`（默认 5 像素）决定采样数，至少 2 个），存三个 `Float64Array`（x、y、累计弧长）；取点是二分查找 + 线性插值。不可变、只在创建时分配。
- 对应 Godot 的 Curve2D，但只保留按距离取点：没有贝塞尔手柄（Tiled 的折线、随机控制点都只有点）、没有 `get_closest_offset`、没有 PathFollow2D 节点（节点自己记 `dist` 再 `sample` 只有三行，llms.txt 里写了这个写法）。
- 闭合曲线：控制点首尾相接，至少 3 个点；首尾的重复点也去掉。
- 塔防原型：`randomPath` 生成控制点后交给 `Curve2D.catmullRom`，怪物的翻转改用 `cos(angleAt(dist)) < 0`。原型的 `path.ts` 从 114 行变成 26 行。
