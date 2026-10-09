# 05 — CanvasLayer：不跟随相机的界面层

**What to build:** HUD（分数、金币数、时间）和屏幕按钮放在 `CanvasLayer` 下，相机移动时它们停在屏幕上不动。
`CanvasLayer` 有自己的层级（`layer`），决定和场景谁画在上面；它下面节点的指针拾取按界面坐标计算。

**Blocked by:** 04 — Camera2D

**Status:** done（2026-10-09）

- [x] `CanvasLayer` 下的节点不受相机偏移影响，仍然受视口缩放影响
- [x] `layer` 决定绘制顺序：大于 0 画在场景上面，小于 0 画在场景下面（远景）
- [x] 指针拾取：界面层上面的按钮优先于场景里的节点，坐标按界面坐标计算
- [x] 场景切换时，属于场景的 CanvasLayer 跟着场景销毁；Autoload 下的 CanvasLayer 保留
- [x] 渲染同步测试和无头拾取测试
- [x] `llms.txt` 加示例（相机跟随的场景 + 不动的 HUD）

## Comments

**实现（2026-10-09）：**

- `CanvasLayer`（`Node`，名字照搬 Godot）：`layer`（默认 1）、`visible`。没有做 Godot 的 offset / rotation / scale / follow_viewport。
- 坐标：`Node._isCanvasLayer` 标记；`Node2D.globalTransform`、`isVisibleInTree`、相机目标、CharacterBody2D 的平移、区块裁剪的祖先遍历都在 CanvasLayer 处断开。它下面的节点是设计坐标。
- 渲染：每个 CanvasLayer 一个容器，挂在场景容器上和世界容器并列（不受相机平移，仍受视口缩放和 keep 模式的遮罩）；顺序是 layer < 0、世界、layer >= 0，同一 layer 按遍历顺序；没遇到的层销毁容器。
  layer 0 画在场景上面（工单只规定了 > 0 和 < 0）。
- 拾取：`collectDrawOrder` 按同样的顺序收集；CanvasLayer 里的节点用设计坐标判断，收到的事件 `position` 也是设计坐标。
- 浏览器验证：相机滚动时 HUD 文字和 layer -1 的远景图块不动，地面滚动（临时 demo 已删除）。

**代码审查（2026-10-09）：** 修了：CanvasLayer 里的刚体写回位置时越过了 CanvasLayer（每步漂移）；同一 layer 的层，拾取和渲染的先后不一致（改为都按树的先序，嵌套的紧跟外层，不看 zIndex）；
外层隐藏时嵌套的层也隐藏、不能被点中；`CharacterBody2D` 只和同一画布的图块地图碰撞；“在 CanvasLayer 处断开”的祖先遍历统一成 `Node._canvasParent`（原来复制在六处，`PhysicsBody2D` 漏了），类型统一成 `CanvasLayerLike`；
拾取时随收集记下节点是否在层里，不再逐个往上找。
没改：CanvasLayer 外面的 Node2D 隐藏不影响它（和 Godot 一样，文档写明）。
