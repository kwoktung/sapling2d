# 07 — Tiled 关卡导入

**What to build:** 关卡用 Tiled 编辑，导出 JSON 放进资源目录。游戏声明并加载这个关卡资源后，得到 TileSet、按 Tiled 里的顺序排好的各个 TileMapLayer，
以及对象层的数据（敌人、金币、出生点的位置、类型和自定义属性），由游戏自己根据对象数据创建节点。

- 图块的自定义属性映射到碰撞类型（实心 / 单向）和自定义字段（例如“可以顶碎”）。
- 只支持正交地图、每个 TileSet 一张图片（ADR 0008）；遇到不支持的特性（无限地图、多张图片的图块集、图块翻转、斜视角）给出明确的错误。
- LDtk 这一轮不做。

**Blocked by:** 02 — TileMapLayer

**Status:** done（2026-10-09）

- [x] 关卡作为资源随场景预加载和卸载，和 `tex()` 等资源的用法一致
- [x] 导入图块层：格子编号、图层名字、可见性、偏移
- [x] 导入图块集：图片、格子边长、间距和边距、每个图块的碰撞类型和自定义字段；外部 `.tsj` 图块集也支持
- [x] 导入对象层：名字、类型（class）、位置、大小、自定义属性
- [x] 不支持的特性报出清晰的错误，指出是哪个图层或图块集
- [x] vite 插件检查关卡文件和它引用的图片是否存在
- [x] 无头测试用一个小的 Tiled 导出文件覆盖以上内容
- [x] `llms.txt` 加示例，说明在 Tiled 里怎么设置碰撞属性

## Comments

**实现（2026-10-09）：**

- `tiledMap(path)`：新的资源类型（同一路径返回同一句柄）。加载：`Platform.loadText` 读关卡文件和外部 `.tsj`（新增的平台方法：浏览器 fetch、小游戏 `readFile`、无头由 `createTestGame` 的 `assetsDir` 从 Node 文件系统读，默认 `public/assets`），再按普通贴图加载图块集图片。卸载只卸图片，解析好的数据保留。
- 结果：`createLayers()` / `createLayer(name)` 生成新的 TileMapLayer（名字、偏移 → position、visible、opacity → alpha、图层整数属性 `collisionLayer`）；`objects(layer?)` / `objectLayers`；`width` / `height` / `tileSize` / `pixelWidth` / `pixelHeight` / `tileSets` / `properties`。
- 碰撞约定：图块的字符串属性 `collision` = `solid` / `oneWay`，其他属性进 `data`。格子的 gid 换成图块集里从 1 开始的编号。
- 报错（指出图层或图块集）：非正交、无限地图、非正方形格子、非 CSV 的图层数据、翻转 / 旋转的图块、一个图层用多个图块集、图层组、图片图层、多图片的图块集、图块集格子和地图不一样大、文件读不到或不是 JSON、`collision` 的值不对。动画图块只警告（画第一帧）。
- vite 插件：检查 `tiledMap('...')` 的关卡文件，以及它引用的外部图块集和图块集图片。
- 浏览器验证：用测试关卡（换上 spike 的图片）在浏览器里通过 fetch 加载、显示两层（临时文件已删除）。

**代码审查（2026-10-09）：** 修了：两个关卡（或关卡和 `tex()`）共用一张图时，切换场景会把它卸载掉——切换场景时 Tiled 关卡展开成它的图片按张判断（`assetResources`），关卡本身不再自己卸载；
推荐扩展名改为 `.json`（小游戏代码包可能不收 `.tmj` / `.tsj`，微信构建时遇到会警告；测试夹具也改成 `.json`）；图块对象带上所在的 `tileSet` 和 `flipH` / `flipV`；
开发服务器监听关卡和图块集文件的变化，重新检查；图层格子数和大小不符时报错；XML 格式的文件报出明确的错误（插件也查外部图块集是不是 JSON）；
路径跳出资源目录时运行时和插件都报错；碰撞编辑器里画的形状被忽略时警告；去掉没用的字段，新增 `layerProperties(name)`。
真机上 `.json` 关卡能不能读到留给 08 验证。
