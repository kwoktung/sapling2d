# 03 — TexturePacker 管线：PNG 序列 + 每帧时长

**What to build:** 高清手绘的管线是“任意工具（Spine、AE、Animate、PS）导出 PNG 序列 → TexturePacker 打包 → `atlas()`”。这条路上的 JSON 里没有帧时长和动画分段，只能在代码或数据里声明。01 做完之后，引擎能力已经够用，这一单主要是把用法写清楚，并找出不顺手的地方。

```ts
attack: { frames: Main.assets.hero.frames('hero_attack_'), durations: [0.1, 0.2, 0.04, 0.04, 0.15], loop: false }
```

**Blocked by:** 01

**Status:** done（2026-10-10）

- [x] `llms.txt` 帧动画一节写明这条管线：同一个角色的序列用**相同的画布尺寸**导出（否则切换动作时角色会跳），TexturePacker 开启 trim、关闭 rotation，帧名带编号（`frames(prefix)` 按数字自然排序）
- [x] 示例测试：用 `docs/examples/sprites.json` 这类图集声明一套长短不一的动画
- [x] `durations` 的长度和 `frames(prefix)` 对不上时，错误信息要能看出是哪套动画、期望几帧
- [x] 如果发现“时长写在代码里”很难维护（例如需要一个小的 JSON 约定，策划可以编辑），记成新工单，不在这里扩大范围
- [x] `pnpm check` 通过

## Comments

**实现（2026-10-10）：**

- 引擎代码没改：01 的 `durations` 加上现有的 `atlas().frames(prefix)` 已经够用；长度对不上的报错（`animation "attack" has 5 frames but 4 durations`）01 就有了，带动画名和帧数。
- `docs/examples/texturepacker.test.ts` + `knight.json`（仿 TexturePacker 的 JSON Hash：7 帧、trim 开启、每帧裁掉的边不同、画布都是 128×128）。示例把时长和命中帧放在一个数据对象里，测试检查所有帧的尺寸都是画布尺寸、命中帧的时间和切回待机。
- `llms.txt` 帧动画下新增“PNG 序列（TexturePacker）”小节：统一画布尺寸、开 trim 关 rotation、帧名编号、前缀冲突、时长长度报错。
- **不顺手的地方**：
  - `frames(prefix)` 是纯前缀匹配，`hero_attack_` 会把 `hero_attack_heavy_01.png` 也取进来，而且不报错。先在文档里写明命名规则，引擎的修改记成 05（needs-triage，因为会改变行为）。
  - “时长写在代码里”：写成一个数据对象（时长 + 命中帧）之后不难维护，暂时不需要额外的 JSON 约定，不开新工单。等塔防的英雄多起来、策划要自己调节奏时再看。
