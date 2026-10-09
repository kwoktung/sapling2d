# 03 — 摇杆：TouchJoystick、Input.getVector 和动作力度值

**What to build:** 小游戏没有键盘，俯视角游戏需要能给出方向和力度的摇杆。

- `Input` 支持动作的力度值（0–1）：键盘、`pointerPress()`、`TouchScreenButton` 按下时力度是 1；新增 `getActionStrength(action)`、
  `getAxis(negative, positive)`、`getVector(negX, posX, negY, posY)`（名字和语义照搬 Godot，结果长度不超过 1，带死区）。
- 新增 `TouchJoystick` 节点（一般挂在 `CanvasLayer` 下）：配置上下左右四个动作，拖动时把力度写进这几个动作，所以游戏代码只调 `getVector`，
  不用关心玩家用的是摇杆还是键盘。
- 两种模式：`dynamic`（默认，在指定区域内按下的地方出现，松手后隐藏，默认区域是屏幕左半边）、`fixed`（位置固定）。

**Blocked by:** None — can start immediately

**Status:** done（2026-10-09；真机验证待做，见下方）

- [x] 力度值和 `getActionStrength` / `getAxis` / `getVector`；现有布尔接口（`isActionPressed` 等）行为不变
- [x] `TouchJoystick`：`dynamic` / `fixed`，死区、最大半径；底座和摇杆头的贴图可以配置
- [x] 多点触控：摇杆占用一个手指，另一个手指可以同时按 `TouchScreenButton`
- [x] 手指抬起、触摸取消、切到后台时动作归零，不会卡住；摇杆离开树时也归零
- [x] 按在摇杆上的手指不参与节点拾取，也不触发 `pointerPress()`（和 `TouchScreenButton` 一致）
- [x] 无头测试可以用 `g.drag` / `g.pointerDown/Move/Up` 驱动摇杆
- [x] 每帧不分配内存（`getVector` 返回 Vector2 的分配在文档里说明，或者另外提供不分配的读法）
- [x] 浏览器里鼠标、触摸都能用
- [ ] 小游戏真机上验证一次（需要用户的手机：发布构建已能生成，见下方）
- [x] `llms.txt` 加示例，说明和 `TouchScreenButton` 的区别

## Comments

**实现（2026-10-09）：**

- **动作力度**（`Input`）：每次更新动作状态时算出每个动作的力度并存下来：按键、`pointerPress()`、屏幕按钮是 1，摇杆是它给出的值，几个来源取最大的。力度 ≥ 0.5 算按下（Godot 动作的默认死区），所以 `isActionPressed` / `isActionJustPressed` 对摇杆照常可用。新增 `getActionStrength`、`getAxis`（不分配）、`getVector`（长度不超过 1，每次分配一个 Vector2，文档里写明，热循环用 `getAxis`）。顺手把 `_updateActions` 里的 `bindings.some(闭包)` 改成了下标循环。
- **`TouchJoystick`**（继承 Node2D）：`mode`（`dynamic` 默认 / `fixed`）、`actions: { left, right, up, down }`、`radius`（默认 100）、`deadzone`（默认 0.2，超过后从 0 线性增加）、`region`（dynamic，默认可见区域的左半边）、`texture` / `textureKnob`（底座和摇杆头，不设就不显示）；`vectorX` / `vectorY`（不分配）、`vector`、`isPressed`，信号 `pressed` / `released`。
  - fixed 的触摸区域用 `hitArea`，默认半径 1.5 × `radius` 的圆。dynamic 没按着时只隐藏贴图子节点，摇杆节点本身保持可见（隐藏的节点不能被拾取）。
  - Input 里按“按钮”的方式接入：参与按绘制顺序的拾取（dynamic 的区域里，画在它上面的按钮先收到指针）；按着摇杆的手指单独记录，它的移动和抬起只交给摇杆，不触发 `pointerPress()`、不点中节点、不滑进 `passbyPress` 按钮；摇杆已经被按着时，第二个手指不归它。
  - 松开：抬起、触摸取消、切到后台（复用 `_releaseAll` 排队的 pointercancel）、隐藏 / 暂停（每帧开始时检查，和按钮一样）、移出树。
  - 坐标：在 CanvasLayer 里用设计坐标，否则用世界坐标（和节点拾取一致）。摇杆自己不能旋转、缩放（文档写明）。
- 每帧不分配：摇杆没有每帧的代码，只在指针事件时更新。
- 测试：`test/touch-joystick.test.ts` 14 个（力度和轴、dynamic 的出现位置和死区换算、斜向、`g.drag`、区域外和第二个手指、自定义 region、fixed、和屏幕按钮同时用、passby 按钮、上层按钮优先、和键盘取最大、后台 / 隐藏 / 移出树松开、暂停、贴图显示和摇杆头限位、相机不影响、未知动作警告）。`docs/examples/touch-joystick.test.ts` 是 `llms.txt` 的示例；`CONTEXT.md` 加了 TouchJoystick 和 Action strength 两个词条。
- spinblade：HUD 是一个 CanvasLayer，里面放一个 dynamic 摇杆（半径 90）；`Player` 用 `getAxis` 读方向（不分配），推得越远走得越快。加了一个用摇杆移动的场地测试。

**浏览器验证（Chrome）：** 用真实的 PointerEvent（`pointerType` 为 mouse 和 touch 各一次）在左半边按下、向右推到底、抬起：摇杆出现在按下的位置，力度 1，玩家约 0.55 秒移动 198px，抬起后归零；截图里底座和摇杆头位置正确。

**真机：** `SAPLING_RELEASE=1 pnpm build:wechat` 能生成 `dist-wechat/`（864 KB）。还没在手机上试：需要用户用预览二维码在 iPhone 上验证一次多点触控（左手摇杆、右手同时按别的地方）。可以和 08 一起做。
