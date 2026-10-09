# 01 — spinblade 骨架：场地、移动、刀圈、捡刀、推挤

**What to build:** 在 `examples/spinblade` 搭出一个用键盘就能玩的骨架（竖屏 750×1334、`expand`，从 `templates/game` 起步）。
玩家在一张 Tiled 做的场地里用 WASD 移动，被墙和障碍物挡住；身边的刀圈一直在转；地上散落的刀走过去就能捡起来，刀圈随之变大。
场地里放几个不动的敌人（也带刀圈），和玩家、彼此之间不会重叠。相机跟随玩家，带场地边界。

刀的摆放按 spec：所有刀直接挂在场地节点下，角色每帧按“刀圈角度 + 第几把刀”算出每把刀的 `x`、`y`、`rotation`；刀数变化时均匀重新分布。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `examples/spinblade` 能 `pnpm --filter example-spinblade dev` 启动；占位美术（纯色刀片、圆形角色、图块）由脚本生成，放在 `public/assets/`
- [ ] 场地是 Tiled 关卡；玩家和敌人是俯视角的 `CharacterBody2D`（没有重力），撞墙会滑动，不会穿墙
- [ ] 刀圈旋转；刀挂在场地节点下，按角度摆放，每帧不分配内存
- [ ] 捡刀：走到地上的刀附近就捡起，刀圈的刀数加 1、重新均匀分布（判定用 `HitTester`）
- [ ] 推挤：玩家和敌人、敌人和敌人之间用 `HitTester` 做圆和圆的组内判定，重叠就推开，不会挤进墙里
- [ ] 相机跟随玩家，有场地边界
- [ ] 无头测试：键盘移动、撞墙、捡刀后刀数变化、两个角色重叠后被推开
- [ ] 俯视角用 `CharacterBody2D` 时遇到的引擎问题记成新工单，不在示例里绕过
