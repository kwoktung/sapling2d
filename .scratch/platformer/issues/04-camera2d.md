# 04 — Camera2D：跟随、边界、平滑

**What to build:** 场景里放一个 `Camera2D` 节点（通常挂在玩家下面），画面就跟着它移动。
可以设置边界（`limit`，不显示关卡之外的区域）和平滑跟随；游戏可以把屏幕坐标换算成世界坐标。
TileMapLayer 的区块裁剪跟着相机走，指针拾取按相机换算坐标。

**Blocked by:** 02 — TileMapLayer（区块裁剪要跟随相机）

**Status:** done（2026-10-09）

- [x] 当前相机决定场景的画面偏移；没有相机时行为和现在一样
- [x] 跟随：相机的全局位置就是画面中心（考虑视口的可见区域）
- [x] `limit` 边界：画面不超出给定的世界范围；关卡比屏幕小时的行为有明确规定
- [x] 平滑跟随（可关闭），按固定步长推进，结果确定
- [x] `screenToWorld` / `worldToScreen`（或与现有 `screenToDesign` 一致的命名）
- [x] 指针拾取在相机移动后仍然命中正确的节点
- [x] TileMapLayer 只显示相机可见范围内的区块
- [x] 开启像素风（01）时，相机偏移对齐到物理像素，不抖动
- [x] 无头测试：相机位置、边界、平滑、坐标换算
- [x] `llms.txt` 加可运行示例

## Comments

**实现（2026-10-09）：**

- `Camera2D`（名字照搬 Godot）：`enabled`、`offset`、`limitLeft/Top/Right/Bottom`、`positionSmoothingEnabled` / `positionSmoothingSpeed`（默认 5，按帧时间指数逼近）、`makeCurrent()`、`isCurrent`、`resetSmoothing()`、`screenCenter`。只做平移，没有 zoom 和旋转。
- 当前相机：场景里第一个启用的相机自动成为当前；被移除或关掉时换树里下一个启用的；都没有时不偏移。
- 范围比画面小时：画面中心固定在范围中心（工单要求“有明确规定”，选了居中）。
- 坐标约定：节点的全局坐标是**世界坐标**；世界坐标 + 相机偏移 = 设计坐标。指针事件（`position`、`pointerPosition`、`pressedPointers`）改为世界坐标，没有相机时和原来完全一样。
  `viewport.screenToWorld` / `worldToScreen` / `visibleWorldRect`。测试工具的 `g.tap(x, y)` 仍然是设计坐标（屏幕位置）。
- 更新时机：每帧所有 process、补间、计时器和帧末销毁之后，渲染之前。
- 渲染：场景容器里多了一层世界容器，相机的平移写在它上面；像素风时对齐到物理像素。Autoload 也随相机平移（和 Godot 一样），固定在屏幕上的界面等 05 的 CanvasLayer。
- TileMapLayer 的区块裁剪按相机平移后的可见范围。
- 浏览器验证：相机跟随、平滑、区块按相机裁剪（临时 demo 已删除）。

**代码审查（2026-10-09）：** 修了：相机目标用真正的全局位置（逐级应用祖先的旋转、缩放，不分配内存；挂在 `scale.x = -1` 的角色下面时局部位置镜像）；
读 `screenCenter` 不再提前用掉 `makeCurrent` / `resetSmoothing` 的跳转；暂停时（相机不能处理）平滑停住；
按住的指针每帧开始时按新的相机位置重算世界坐标（内部同时记屏幕位置）；`screenToWorld` 改为 `screenToDesign` + `designToWorld`（新增 `designToWorld` / `worldToDesign`）。
没改：Autoload 和界面随相机移动（和 Godot 一样，等 05 的 CanvasLayer）；改屏幕尺寸后偏移要到下一帧才更新（渲染总在更新之后，中间没有画面）；
像素风时输入用的是没有取整的相机偏移（最多差 1 个物理像素）；边界计算假设可见区域对称（expand / keep 都是）。
