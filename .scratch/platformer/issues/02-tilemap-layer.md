# 02 — TileMapLayer：TileSet、格子数据、区块 Mesh 渲染

**What to build:** 游戏可以用代码建一个 `TileSet`（一张图集贴图、格子边长、每个图块的属性）和若干 `TileMapLayer` 节点，
`setCell` 之后画面上出现关卡，`eraseCell` 之后对应的格子消失。设计见 ADR 0008，渲染方式来自 `spikes/tilemap/REPORT.md`。

- 数据：每层大小在创建时固定，格子存在 `Uint16Array` 里（0 为空），地图外算空。接口照搬 Godot：`setCell` / `eraseCell` / `getCell` / `localToMap` / `mapToLocal` / `getUsedRect`，以及读取某格图块属性（碰撞类型、自定义字段）的方法。
- 渲染：16 × 16 格一个区块，每个区块一个 Mesh（容量固定，空格子写退化四边形，16 位索引）；屏幕外的区块隐藏（按视口可见范围换算到图层局部坐标）；改一格只重写这格的顶点并上传所在区块。
- 碰撞：不生成 planck 物体。图块的碰撞类型只有空 / 实心 / 单向。图层进入场景树时登记、离开时注销，对外提供“格子边长 + 某格碰撞类型”的内部查询接口，供 03 使用（ADR 0009）。

**Blocked by:** 01 — 像素风渲染选项（TileSet 的采样方式沿用 01 的机制）

**Status:** done（2026-10-09）

- [x] 无头测试：建图、`setCell` / `eraseCell` / `getCell`、坐标换算、`getUsedRect`、读图块属性、地图外为空
- [x] 无头测试：图层登记和注销，碰撞查询返回正确的类型（查询用格子坐标，图层平移的换算在 03 的 `moveAndSlide` 里做和测）
- [x] 渲染同步测试：区块按需创建，屏幕外的区块隐藏，改格子只更新一个区块
- [x] 销毁顺序：先销毁区块 Mesh，再释放贴图，不出现 Pixi 的“贴图还绑在着色器上”警告；贴图由资源系统管理，不跟着图层销毁
- [x] 场景树转储（dump）能看到图层的大小和图块数量
- [x] 浏览器里能看到一个用代码生成的小关卡，并能看到改格子的效果
- [x] `llms.txt` 加可运行示例，写明限制（一个 TileSet 一张贴图、整格碰撞、图层不能旋转缩放）
- [x] `CONTEXT.md` 加 TileSet / TileMapLayer 词条

## Comments

**实现（2026-10-09）：**

- `tileset(path, { tileSize, tiles, columns?, margin?, spacing? })` 是一种资源（`AssetMap` 里加了 TileSet，加载和卸载按整张图），vite 插件也检查它的图片路径。
  图块属性 `collision`（`solid` / `oneWay`）和 `data`；内部把碰撞类型编码成 `Uint8Array`，`_cellCollision(cx, cy)` 查询不分配内存。
- `TileMapLayer`：`setCell` / `eraseCell` / `getCell` / `getCellTileData` / `localToMap` / `mapToLocal` / `getUsedRect` / `usedCellCount` / `collisionLayer`。
  地图外 `getCell` 返回 0，`setCell` 报错。进入树时登记到 `tree._tileLayers`，离开时注销。
- 渲染：每个区块一个 Mesh，第一次进入屏幕时才创建；按节点的全局变换把视口可见区域换算到图层局部坐标来裁剪；每个区块有版本号，改格子只重写那个区块（256 个四边形一起写，比只写一格简单，开销可以忽略）。打开 `pixelArt` 时区块 Mesh 也对齐像素。
- 着色器：spike 里的 Pixi 警告来自 Pixi 共用的 Mesh 着色器——它一直绑着最后画过的图，和销毁顺序无关。改为每张图块集图片一个着色器（程序和 Pixi 默认的 Mesh 着色器相同），释放图片前先销毁它。
  浏览器验证：滚动、裁剪（26 个区块只创建了 8 个）、改格子、切换场景卸载图块集，控制台没有警告，着色器和图片源都释放了（临时 demo 已删除）。

**代码审查（2026-10-09）：** 修了：裁剪时逐级累乘全局变换，不再每帧创建 Transform2D；只遍历屏幕内和上一帧屏幕内的区块；隐藏的图层不建区块；
线性采样时 uv 向内缩半个像素，避免混进相邻图块（像素风不缩）；`tile(id)` 限制在 65535 以内，缓存有上限；删掉没用到的 `TileSet._unload`。
没改：`assetRoot` 用 `kind` 判断 TileSet（避免循环依赖，已加注释）；`_cellCollision` 不检查整数（热路径，注释写明调用方先取整，03 里测）；每个区块各自上传一份索引缓冲区（约 3 KB，不值得绕开 Pixi 的 MeshGeometry）。
