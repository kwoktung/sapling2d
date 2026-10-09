# 03 — 摇杆：TouchJoystick、Input.getVector 和动作力度值

**What to build:** 小游戏没有键盘，俯视角游戏需要能给出方向和力度的摇杆。

- `Input` 支持动作的力度值（0–1）：键盘、`pointerPress()`、`TouchScreenButton` 按下时力度是 1；新增 `getActionStrength(action)`、
  `getAxis(negative, positive)`、`getVector(negX, posX, negY, posY)`（名字和语义照搬 Godot，结果长度不超过 1，带死区）。
- 新增 `TouchJoystick` 节点（一般挂在 `CanvasLayer` 下）：配置上下左右四个动作，拖动时把力度写进这几个动作，所以游戏代码只调 `getVector`，
  不用关心玩家用的是摇杆还是键盘。
- 两种模式：`dynamic`（默认，在指定区域内按下的地方出现，松手后隐藏，默认区域是屏幕左半边）、`fixed`（位置固定）。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 力度值和 `getActionStrength` / `getAxis` / `getVector`；现有布尔接口（`isActionPressed` 等）行为不变
- [ ] `TouchJoystick`：`dynamic` / `fixed`，死区、最大半径；底座和摇杆头的贴图可以配置
- [ ] 多点触控：摇杆占用一个手指，另一个手指可以同时按 `TouchScreenButton`
- [ ] 手指抬起、触摸取消、切到后台时动作归零，不会卡住；摇杆离开树时也归零
- [ ] 按在摇杆上的手指不参与节点拾取，也不触发 `pointerPress()`（和 `TouchScreenButton` 一致）
- [ ] 无头测试可以用 `g.drag` / `g.pointerDown/Move/Up` 驱动摇杆
- [ ] 每帧不分配内存（`getVector` 返回 Vector2 的分配在文档里说明，或者另外提供不分配的读法）
- [ ] 浏览器里鼠标、触摸都能用；小游戏真机上验证一次
- [ ] `llms.txt` 加示例，说明和 `TouchScreenButton` 的区别
