# 美术管线

提示词 → AI 生成 → 抠图 → 缩放 → 图集，一条命令：

```sh
pnpm art                         # 整条管线；已有原图的素材不重新生成
pnpm art gen --only archer_full  # 只跑某一步（gen / key / resize / pack / preview），只处理某些素材（逗号分隔）
pnpm art gen --only archer_full --force   # 重新生成（覆盖原图）
```

- **素材清单** `art/assets.ts`：每个素材的提示词、模式（`generate` 生成 / `edit` 基于参考图编辑）、参考图、背景色、显示高度、图集、锚点。**风格模板** `art/style.md` 自动拼在生成模式的提示词后面；`STYLE_ANCHOR` 设好后，生成模式都附上锚点图。
- **API key**：读环境变量 `GEMINI_API_KEY`（Google AI Studio 的 key），模型是 Nano Banana 2（`gemini-3.1-flash-image`）。一张约 10–15 秒。
- **目录**（都在 `art/` 下）：`raw/` AI 原图、`work/` 抠好的透明图（这两个不进 git：AI 每次结果都不同，原图丢了就重新生成）→ `sprites/` 缩到显示高度 2 倍的透明 PNG（**进 git**，游戏素材的来源）→ `public/assets/<图集>.png` + `.json`（TexturePacker 格式，`atlas()` 直接读）。`preview.png` 是所有精灵在棋盘格上的拼图，用来检查抠图边缘。
- **背景色**：默认品红 `#FF00FF`；素材本身有品红或很纯的紫色时，在清单里给它换成绿色 `#00FF00` 之类，否则那部分会被抠掉。抠图会顺带去掉模型画在背景上的阴影和被围住的背景色（比如弓和弓弦之间）。模型给的“纯色背景”常常偏一点（要 `#FF00FF` 给了 `#D141BC`），抠图前先取四个角的实际颜色，色相接近就用它来抠。
- **锚点**：身体设 `pivot: { x: 0.5, y: 1 }`（脚底），游戏里身体精灵放在英雄节点的原点就站在槽位上；武器设握持点。
- **序列帧**（`frames: 4`，比例 `21:9`）：一张图横排 N 帧。抠图时不裁边，按**连通块**分帧（每块整个分给中心落在的那一格；AI 画的帧常常横向重叠，竖着切会切掉刀尖），每帧裁边后放进同样大小的画布、底边对齐、水平居中，统一缩放，输出 `<id>_0` … `<id>_<N-1>`。两帧粘在一起时会提示并报错（换一张）。`mirror: true` 先左右翻转原图（模型偶尔画成镜像）。走路帧用 `walkCandidates()` 先出 3 套候选，挑定后存成 `refs/walk_<名字>.jpg` 加进 `WALKS`。
- 抠图不理想的个别素材：手工在 PS / Photopea 里修好，直接放进 `art/sprites/`（不要再跑这个素材的 key / resize，否则会被覆盖），在清单旁边注释说明。
