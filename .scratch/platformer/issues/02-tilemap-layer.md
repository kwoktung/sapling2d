# 02 — TileMapLayer：TileSet、格子数据、区块 Mesh 渲染

**What to build:** 游戏可以用代码建一个 `TileSet`（一张图集贴图、格子边长、每个图块的属性）和若干 `TileMapLayer` 节点，
`setCell` 之后画面上出现关卡，`eraseCell` 之后对应的格子消失。设计见 ADR 0008，渲染方式来自 `spikes/tilemap/REPORT.md`。

- 数据：每层大小在创建时固定，格子存在 `Uint16Array` 里（0 为空），地图外算空。接口照搬 Godot：`setCell` / `eraseCell` / `getCell` / `localToMap` / `mapToLocal` / `getUsedRect`，以及读取某格图块属性（碰撞类型、自定义字段）的方法。
- 渲染：16 × 16 格一个区块，每个区块一个 Mesh（容量固定，空格子写退化四边形，16 位索引）；屏幕外的区块隐藏（按视口可见范围换算到图层局部坐标）；改一格只重写这格的顶点并上传所在区块。
- 碰撞：不生成 planck 物体。图块的碰撞类型只有空 / 实心 / 单向。图层进入场景树时登记、离开时注销，对外提供“格子边长 + 某格碰撞类型”的内部查询接口，供 03 使用（ADR 0009）。

**Blocked by:** 01 — 像素风渲染选项（TileSet 的采样方式沿用 01 的机制）

**Status:** ready-for-agent

- [ ] 无头测试：建图、`setCell` / `eraseCell` / `getCell`、坐标换算、`getUsedRect`、读图块属性、地图外为空
- [ ] 无头测试：图层登记和注销，碰撞查询返回正确的类型；图层平移后查询仍然正确
- [ ] 渲染同步测试：区块按需创建，屏幕外的区块隐藏，改格子只更新一个区块
- [ ] 销毁顺序：先销毁区块 Mesh，再释放贴图，不出现 Pixi 的“贴图还绑在着色器上”警告；贴图由资源系统管理，不跟着图层销毁
- [ ] 场景树转储（dump）能看到图层的大小和图块数量
- [ ] 浏览器里能看到一个用代码生成的小关卡，并能看到改格子的效果
- [ ] `llms.txt` 加可运行示例，写明限制（一个 TileSet 一张贴图、整格碰撞、图层不能旋转缩放）
- [ ] `CONTEXT.md` 加 TileSet / TileMapLayer 词条
