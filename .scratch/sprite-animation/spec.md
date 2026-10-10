# Spec: 帧动画的节奏、导入器（Aseprite / TexturePacker）

Status: ready-for-agent
Date: 2026-10-10

竖版塔防（英雄有完整的攻击序列帧）需要“前摇停得久、出手帧很短”的攻击动作，还要知道命中帧在什么时候、特效从哪里发出。现在的 `AnimatedSprite2D` 只有统一的 `fps`。

做法参照 Godot：**引擎核心是格式无关的数据模型（SpriteFrames 带每帧时长），各种外部格式由导入器转换成它**。所以先做核心，再做导入器；以后换美术工具，游戏代码不用改。

## 目标

- 核心：`SpriteAnimation` 支持每帧时长，提供动画时长和帧时间点的查询接口（用来把攻速和动画对上，算出命中时间）。
- 导入器一：`aseprite(path, data)` 读取 Aseprite 导出的 JSON，tag → 动画，`duration` → 每帧时长，slices → 挂点。
- 导入器二：TexturePacker 管线（PNG 序列 → `atlas()`），每帧时长在代码或数据里声明。主要是文档和示例；pivot 另外决定。
- 每一项都在 `docs/examples/*.test.ts` 加示例测试，并更新 `llms.txt`。

## 不做

- 骨骼动画（Spine / DragonBones）：会增加包体积，iOS 上也慢。
- 动作时间轴（AnimationPlayer）、帧事件：先用 `frameChanged` + 帧号在游戏里实现，等第二个游戏也需要时再考虑（见“未定”）。
- 在构建时调用 Aseprite CLI 自动导出：仓库里提交导出好的 png + json，不要求开发机装 Aseprite。

## 已定

- **时长用秒**，写成 `durations: number[]`，长度和 `frames` 相同，每个值都 > 0。比 Godot 的“fps × 倍率”更直观，Aseprite 的毫秒除以 1000 就能直接用。`fps` 和 `durations` 只能二选一，同时传时报错。
- **核心不认识播放方向**：pingpong / reverse / 重复次数都由导入器展开成 `frames` + `durations`，核心只按顺序播放。
- **命中帧安全**：`_internalProcess` 用 while 逐帧推进，`speedScale` 再大也会逐帧触发 `frameChanged`，所以命中帧不会被跳过。改成每帧时长之后要保持这一点，并补一个测试。
- **轴心靠统一画布**：Aseprite 一个文件里所有帧共用同一块画布；TexturePacker 管线要求同一个角色的序列用相同的画布尺寸导出（trimmed 会保住对齐）。核心不加 pivot。

## 顺序

| 工单 | 内容 | 依赖 |
|---|---|---|
| 01 | 核心：每帧时长 + 时长和帧时间点的查询 | — |
| 02 | `aseprite()` 导入器：tag、方向、重复、时长、slices | 01 |
| 03 | TexturePacker 管线：文档和示例（`atlas().frames()` + `durations`） | 01 |
| 04 | TexturePacker 的 pivot（每张贴图一个锚点） | 03，待定 |

## 未定（Fog）

- 帧事件：要不要放进数据里（例如 Aseprite tag / 帧的 user data，或者在 `SpriteAnimation` 里写 `events: { 3: 'hit' }`）。等塔防的英雄写出几个之后再看是否值得。
- Aseprite slices 当 pivot 用的约定（比如名为 `pivot` 的 slice）：同 04，有需要再做。
