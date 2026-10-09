# 06 — Particles2D：精简版粒子

**What to build:** 刀碰撞的火花、击杀时的碎片。新增 `Particles2D` 节点，参数保持最小：

- 一张贴图（可以是图集里的一帧）；
- 一次性爆发（`emit(count)` 或 `oneShot`）和持续发射（每秒数量）；
- 生命周期、初速度和方向扩散角、速度随机范围、重力；
- 随生命周期变化的缩放和透明度（起始值 → 结束值）。

粒子不是节点：数据存在节点内部的数组里，模拟在 `process` 里做，渲染层批量绘制（Pixi 的 `ParticleContainer` 或同等做法）。
随机数用 `tree.rng`，无头测试可复现。

**Blocked by:** None — can start immediately

**Status:** done（2026-10-09）

- [x] 爆发和持续发射；`emitting`、`amount`（同时存活上限）；全部粒子结束时发出信号（方便 `queueFree`）
- [x] 粒子坐标：发射时继承节点的全局位置，之后不随节点移动（火花不跟着角色走）
- [x] 受 `tree.timeScale`（04）和暂停影响
- [x] 每帧不分配内存；粒子数据预先分配，达到上限时不再发射
- [x] 无头模式下照常模拟（不渲染），`dump` 显示存活粒子数；测试可以检查数量和生命周期
- [x] iPhone 真机：同屏 500 个粒子时记录每帧逻辑和渲染耗时（见 08：60 fps，逻辑 1.68 ms，渲染 5.37 ms）
- [x] `examples/plane` 的爆炸改用它（验证接口在第二个游戏里也合适）
- [x] `llms.txt` 加示例

## Comments

**实现（2026-10-09）：**

- `Particles2D`（继承 Node2D）。参数：`texture`、`amount`（存活上限，默认 16）、`lifetime`、`lifetimeRandomness`、`emitting`（默认 true，和 Godot 一样）、`oneShot`、`rate`（默认 `amount / lifetime`）、`direction` + `spread`（默认 π，所有方向）、`speedMin` / `speedMax`、`gravity`、`damping`、`scaleStart → scaleEnd`、`alphaStart → alphaEnd`、`localCoords`。方法 `emit(n)`、`restart()`，`aliveCount`，信号 `finished`。
  - 工单原文的“发射形状”“颜色渐变”没有做（不在精简范围内）；多加了 `damping`（碎片、火花不减速很假）和 `lifetimeRandomness`（同时消失很假），都是一行代码。
  - `oneShot` 是“一次爆发 amount 个”，不是 Godot 那样在一个寿命里发完（Godot 需要 `explosiveness = 1` 才是爆发）；文档写明。
- 模拟：数据在 `Float64Array` 里（位置、速度、年龄、寿命），设置 `amount` 时一次分配；死掉的粒子用最后一个填位。在 `_internalProcess` 里模拟，所以受 `timeScale` 和暂停影响、子类覆写 `process` 不影响粒子。随机数用 `tree.rng`。
- 全局坐标：发射点用不分配内存的全局变换（只算到 CanvasLayer，和 Camera2D 的做法一样）；方向跟着节点的全局旋转。渲染时把内容层的变换设成节点全局变换的逆，所以粒子画在全局坐标上，节点怎么动都不影响已经发出去的粒子。
- 渲染：每个发射器一个 Pixi `ParticleContainer`（一次绘制调用；位置、缩放、透明度是动态属性，贴图坐标静态）。Pixi v8 里它是可选扩展，引擎启动时 `skipExtensionImports`，所以在渲染器里 `import 'pixi.js/particle-container'`。粒子对象按需创建、复用（数量第一次达到某个值时才 new）。着色器是 GLSL 100，WebGL1 可用；它的上传函数本来用 `new Function` 生成，小游戏里由已经引入的 `pixi.js/unsafe-eval` 换成预置函数（查过 Pixi 源码）。
- 测试：`test/particles.test.ts` 17 个（默认值、emit 的位置 / 方向 / 速度 / 上限、spread 和速度范围、寿命和 finished、lifetimeRandomness、持续发射和 rate、oneShot、重力和阻尼、全局坐标和全局旋转、localCoords、timeScale / 暂停 / 同一 seed 可复现、dump、不在树里、渲染同步（粒子数、插值、对象复用、逆变换、没有贴图、隐藏））。`docs/examples/particles.test.ts` 是 `llms.txt` 的示例（烟和火花）。
- `examples/plane`：爆炸 = 原来的火球帧动画 + 碎片粒子（图集里的 8px 白块染橙色，数量和速度随爆炸大小），`finished` 后删掉；战斗测试检查碎片出现和删除。没有把火球换成粒子：帧动画比粒子好看，粒子补上飞散的碎片。

**测量：**

- 浏览器（Chrome，有 JIT，120Hz）：飞机大战结束画面加一个维持 500 个粒子的发射器，每帧逻辑 0.019 → 0.034 ms、渲染 0.107 → 0.179 ms，仍是 120 fps。截图里火球周围的碎片位置正确。
- 模拟耗时（`pnpm --filter sapling2d bench:particles[:jitless]`）：

| 粒子数 | 有 JIT (ms/帧) | 无 JIT (ms/帧) |
|---:|---:|---:|
| 100 | 0.004 | 0.021 |
| 500 | 0.003 | 0.074 |
| 2000 | 0.009 | 0.288 |

- 小游戏发布构建（plane）能生成。**iPhone 真机上 500 个粒子的数据还没测**（需要用户的手机），和 08 一起做。
