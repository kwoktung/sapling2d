# 04 — tree.timeScale：打击停顿和慢动作

**What to build:** 刀碰刀、击杀 Boss 时让画面停顿 50–100ms，或者短暂慢动作。新增 `tree.timeScale`（默认 1，可以设为 0），
缩放所有游戏时间：`process` 的 dt、物理步（物理步长仍然固定 1/60，只是步数变少）、Tween、Timer、`tree.time`。
界面也一起受影响，不区分（停顿很短，界面停一下看不出来）。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `tree.timeScale`，默认 1，现有游戏的行为不变；小于 0 时报错
- [ ] `process(dt)` 收到缩放后的 dt；物理步、Tween、Timer、`tree.time` 都按缩放后的时间推进
- [ ] 为 0 时游戏时间完全停止，但输入事件照常处理（停顿结束后不丢按键），渲染照常
- [ ] 和 `tree.paused` 的关系写清楚（两者独立）
- [ ] 恢复时间用真实时间：停顿要能在 `timeScale = 0` 时自己结束（例如提供一个不受缩放影响的等待方式，或者文档写明用什么办法）
- [ ] 无头测试：`g.step` 在不同 `timeScale` 下物理步数、Tween 进度、Timer 触发时间正确
- [ ] `llms.txt` 加打击停顿的示例
