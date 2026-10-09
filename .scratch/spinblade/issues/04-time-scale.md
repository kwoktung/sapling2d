# 04 — tree.timeScale：打击停顿和慢动作

**What to build:** 刀碰刀、击杀 Boss 时让画面停顿 50–100ms，或者短暂慢动作。新增 `tree.timeScale`（默认 1，可以设为 0），
缩放所有游戏时间：`process` 的 dt、物理步（物理步长仍然固定 1/60，只是步数变少）、Tween、Timer、`tree.time`。
界面也一起受影响，不区分（停顿很短，界面停一下看不出来）。

**Blocked by:** None — can start immediately

**Status:** done（2026-10-09）

- [x] `tree.timeScale`，默认 1，现有游戏的行为不变；小于 0 时报错
- [x] `process(dt)` 收到缩放后的 dt；物理步、Tween、Timer、`tree.time` 都按缩放后的时间推进
- [x] 为 0 时游戏时间完全停止，但输入事件照常处理（停顿结束后不丢按键），渲染照常
- [x] 和 `tree.paused` 的关系写清楚（两者独立）
- [x] 恢复时间用真实时间：停顿要能在 `timeScale = 0` 时自己结束（例如提供一个不受缩放影响的等待方式，或者文档写明用什么办法）
- [x] 无头测试：`g.step` 在不同 `timeScale` 下物理步数、Tween 进度、Timer 触发时间正确
- [x] `llms.txt` 加打击停顿的示例

## Comments

**实现（2026-10-09）：**

- `tree.timeScale`（默认 1；负数、NaN、无穷大报错）。`advance(dt)` 先把真实 dt 截断（原有的单帧上限），再乘 `timeScale` 得到游戏时间，之后的物理累加器、`process(dt)`、`_internalProcess`（Timer 节点、帧动画）、Tween、`createTimer`、相机平滑全部用游戏时间。物理步长不变（1/60），只是步数变化；`tree.time` 按物理步累计，所以自动跟着缩放。
- 为 0 时：没有物理步，`process` 仍然每帧调用（dt 为 0，和 Godot 一样），输入照常处理、渲染照常。停顿中按下的键：`process` 里当帧是 just pressed；`physicsProcess` 里的 just pressed 留到恢复后的第一个物理步（物理步的 just 状态只在物理步结束时清空），不会丢。
- 恢复用真实时间：`createTimer(秒, { ignoreTimeScale: true })`（`SceneTreeTimer.ignoreTimeScale`）。只给一次性计时器加了这个选项；Tween、Timer 节点没有（按决定 B，界面也一起变慢；需要时再加）。
- 大于 1 时受 `maxPhysicsStepsPerFrame`（默认 2）限制，文档写明。
- 测试：`test/time-scale.test.ts` 7 个（默认值和非法值、0.5 倍时 dt / 物理步 / time / Tween / Timer、2 倍、0 时刚体 / Tween / Timer / createTimer / 帧动画 / time 全部停住且停顿前确实在走、停顿中的按键不丢、ignoreTimeScale 恢复、和 paused 独立）。`docs/examples/time-scale.test.ts` 是 `llms.txt` 的示例（打击停顿和慢动作）；`CONTEXT.md` 加了 timeScale 词条。
- 写示例测试时踩到已有的陷阱：`await signal` 在一个微任务之后才注册，测试里连续 `g.step()` 中间没有微任务，计时器触发时还没人监听。真实游戏里帧之间隔着事件循环，不受影响；测试里调用 `hitStop` 后先让出一轮再推进。

**发现的问题（另开工单 09）：** 文档说 `tree.time`“暂停时不走”，实际暂停时照样走（物理步计数不管是否暂停都在增加）。和本工单无关，没有改。
