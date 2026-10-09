# 09 — tree.time 暂停时仍在走，和文档不一致

**What to build:** `llms.txt`（核心概念 → 场景树）写的是 `time`“游戏时间，秒，按物理步累计，暂停时不走”，但 `SceneTree.advance` 不管是否暂停都会执行物理步并增加 `_physicsFrames`，所以 `tree.time` 在暂停时照样增加（实测：暂停后推进 60 帧，`time` 增加 1 秒）。

要先决定哪边是对的：

- **改代码**：暂停时不增加 `time`（但 `processMode: always` 的节点仍然有物理步，`physicsFrames` 是否也停要一起定）。游戏里用 `tree.time` 做冷却（例如 spinblade 的刀伤冷却）时，暂停期间冷却不会偷偷走完。
- **改文档**：`time` 是“经过的物理步时间”，暂停不影响；需要暂停时停住的计时用 Timer / Tween。

**Blocked by:** None

**Status:** done（2026-10-09）

- [x] 决定行为（代码还是文档），并说明 `physicsFrames` 和 `time` 的关系
- [x] 测试覆盖暂停时 `time` 的行为
- [x] `llms.txt` 和 `CONTEXT.md` 和实现一致

## Comments

**发现（2026-10-09）：** 做 04（`timeScale`）时发现。`timeScale` 为 0 时 `time` 会停（没有物理步），暂停时却不停，两者不对称。

**决定（2026-10-09）：** 改代码（选项 A）。`time` 叫“游戏时间”，游戏会自然地拿它做冷却和时间点，期望它随暂停停住；和 `timeScale = 0` 时的行为也应该一致。

**实现：**

- `SceneTree` 里 `time` 和 `physicsFrames` 分开：`physicsFrames` 照旧每个物理步都计数（暂停时 `processMode: always` 的节点仍然有物理步）；`time` = 没暂停时执行的物理步数 × 步长（计数而不是累加小数，不积累误差）。
- 所以 `time` 在暂停时、`timeScale = 0` 时都停住，`timeScale = 0.5` 时走得慢一半。
- 测试：`test/time-scale.test.ts` 加了“暂停时 time 停住、physicsFrames 照常计数、恢复后继续走”。
- 文档：`llms.txt` 核心概念里写清 `time` 和 `physicsFrames` 的区别；`CONTEXT.md` 的 timeScale 词条补了一句。
- 影响面：用到 `tree.time` 的只有 plane（标题和结束画面的闪烁、输入延迟）和 spinblade（刀伤冷却、打击停顿冷却、Boss 转速起伏、结果画面输入延迟），都不在暂停时依赖时间前进；所有示例测试照常通过。
