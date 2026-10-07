# 06 — Pointer 输入、InputMap、命中测试

**What to build:** 玩家可以点击或拖拽屏幕上的节点，游戏也可以按动作名查询输入。无头测试能注入同样的输入。

**Blocked by:** 05

**Status:** done（2026-10-07）

- [x] 浏览器的 pointer 事件统一成平台无关的 Pointer 输入流，坐标换算到设计坐标；不使用 Pixi 的 EventSystem（见 ADR 0001）
- [x] 节点命中测试由引擎自己实现：节点可以声明可点击区域，接收按下、移动、抬起信号，并考虑 zIndex 和遮挡关系
- [x] 支持全局的 Pointer 查询，比如当前按下的位置
- [x] InputMap：定义动作并把输入绑定到动作上，支持 `Input.isActionPressed` 和 `Input.isActionJustPressed`；键盘绑定只在 web 端生效
- [x] 无头模式下 `g.tap(x, y)` 和拖拽注入走同一条输入流，有测试覆盖
