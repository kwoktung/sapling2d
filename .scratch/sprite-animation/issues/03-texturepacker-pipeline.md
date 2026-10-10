# 03 — TexturePacker 管线：PNG 序列 + 每帧时长

**What to build:** 高清手绘的管线是“任意工具（Spine、AE、Animate、PS）导出 PNG 序列 → TexturePacker 打包 → `atlas()`”。这条路上的 JSON 里没有帧时长和动画分段，只能在代码或数据里声明。01 做完之后，引擎能力已经够用，这一单主要是把用法写清楚，并找出不顺手的地方。

```ts
attack: { frames: Main.assets.hero.frames('hero_attack_'), durations: [0.1, 0.2, 0.04, 0.04, 0.15], loop: false }
```

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `llms.txt` 帧动画一节写明这条管线：同一个角色的序列用**相同的画布尺寸**导出（否则切换动作时角色会跳），TexturePacker 开启 trim、关闭 rotation，帧名带编号（`frames(prefix)` 按数字自然排序）
- [ ] 示例测试：用 `docs/examples/sprites.json` 这类图集声明一套长短不一的动画
- [ ] `durations` 的长度和 `frames(prefix)` 对不上时，错误信息要能看出是哪套动画、期望几帧
- [ ] 如果发现“时长写在代码里”很难维护（例如需要一个小的 JSON 约定，策划可以编辑），记成新工单，不在这里扩大范围
- [ ] `pnpm check` 通过

## Comments
