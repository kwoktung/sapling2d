# 01 — spinblade 骨架：场地、移动、刀圈、捡刀、推挤

**What to build:** 在 `examples/spinblade` 搭出一个用键盘就能玩的骨架（竖屏 750×1334、`expand`，从 `templates/game` 起步）。
玩家在一张 Tiled 做的场地里用 WASD 移动，被墙和障碍物挡住；身边的刀圈一直在转；地上散落的刀走过去就能捡起来，刀圈随之变大。
场地里放几个不动的敌人（也带刀圈），和玩家、彼此之间不会重叠。相机跟随玩家，带场地边界。

刀的摆放按 spec：所有刀直接挂在场地节点下，角色每帧按“刀圈角度 + 第几把刀”算出每把刀的 `x`、`y`、`rotation`；刀数变化时均匀重新分布。

**Blocked by:** None — can start immediately

**Status:** done（2026-10-09）

- [x] `examples/spinblade` 能 `pnpm --filter example-spinblade dev` 启动；占位美术（纯色刀片、圆形角色、图块）由脚本生成，放在 `public/assets/`
- [x] 场地是 Tiled 关卡；玩家和敌人是俯视角的 `CharacterBody2D`（没有重力），撞墙会滑动，不会穿墙
- [x] 刀圈旋转；刀挂在场地节点下，按角度摆放，每帧不分配内存
- [x] 捡刀：走到地上的刀附近就捡起，刀圈的刀数加 1、重新均匀分布（判定用 `HitTester`）
- [x] 推挤：玩家和敌人、敌人和敌人之间用 `HitTester` 做圆和圆的组内判定，重叠就推开，不会挤进墙里
- [x] 相机跟随玩家，有场地边界
- [x] 无头测试：键盘移动、撞墙、捡刀后刀数变化、两个角色重叠后被推开
- [x] 俯视角用 `CharacterBody2D` 时遇到的引擎问题记成新工单，不在示例里绕过

## Comments

**实现（2026-10-09）：**

- `examples/spinblade`：竖屏 750×1334。场地 32 × 44 格（48px），Tiled JSON（`levels/arena.json` + 外部图块集），四周是墙，中间有墙段和石头堆；对象层放出生点、5 个敌人（属性 `knives` 是初始刀数）、40 把地上的刀（固定种子随机分布）。占位图和关卡都由 `scripts/gen-assets.mjs` 生成。
- `Fighter`（`Player` / `Enemy` 的基类）是俯视角的 `CharacterBody2D`：方框 56px 和墙碰撞，身体圆半径 36 用于推挤和捡刀。敌人目前站着不动，刀圈反向转。
- 刀全部挂在场地下面；`Fighter.placeKnives()` 每个物理步按 `ringAngle + i·2π/n` 摆放，刀尖朝外；刀圈半径 = max(78, n·26 / 2π)。
- 捡刀：`Knife.dead` 在有主人时为 true，`HitTester` 自动跳过、`HitTester.compact` 把它从地上的刀里去掉，所以一把刀只会被一个角色捡起。
- 推挤：`HitTester` 组内判定，每个角色记下自己那一半的重叠量，下一次 `moveAndSlide` 时作为额外速度（每步消除一半重叠），所以被推的角色也会被墙挡住。
- 每个物理步不分配内存：`placeKnives` 只做三角函数；HitTester 的回调是字段（建一次）。
- 8 个无头测试：关卡内容、移动（斜向不更快）、撞墙、刀圈旋转和朝向、捡刀和重新分布、刀圈变大、一把刀只被捡一次、推开（包括完全重合）、被推的角色被墙挡住。
- 浏览器验证（Chrome，400×712）：画面正常，相机跟随且不超出场地；WASD 移动、被墙段挡住、捡刀、推开敌人都正常。逻辑耗时平均约 0.09 ms/帧。

**引擎：** 俯视角用 `CharacterBody2D`（不加重力、不用 `isOnFloor`）没有遇到问题，没有新开工单。
