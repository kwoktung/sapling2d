# 05 — CanvasLayer：不跟随相机的界面层

**What to build:** HUD（分数、金币数、时间）和屏幕按钮放在 `CanvasLayer` 下，相机移动时它们停在屏幕上不动。
`CanvasLayer` 有自己的层级（`layer`），决定和场景谁画在上面；它下面节点的指针拾取按界面坐标计算。

**Blocked by:** 04 — Camera2D

**Status:** ready-for-agent

- [ ] `CanvasLayer` 下的节点不受相机偏移影响，仍然受视口缩放影响
- [ ] `layer` 决定绘制顺序：大于 0 画在场景上面，小于 0 画在场景下面（远景）
- [ ] 指针拾取：界面层上面的按钮优先于场景里的节点，坐标按界面坐标计算
- [ ] 场景切换时，属于场景的 CanvasLayer 跟着场景销毁；Autoload 下的 CanvasLayer 保留
- [ ] 渲染同步测试和无头拾取测试
- [ ] `llms.txt` 加示例（相机跟随的场景 + 不动的 HUD）
