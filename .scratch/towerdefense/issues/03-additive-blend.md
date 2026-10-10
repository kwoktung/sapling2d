# 03 — 引擎：叠加混合（`blendMode: 'add'`）

**What to build:** 原型验证出来的 P0：火球、爆炸、刀光用普通混合叠在怪物上是一团发灰的颜色。给 `Node2D` 加 `blendMode`，`'add'` 叠加发光。

**Blocked by:** 01

**Status:** done（2026-10-10）

- [x] `Node2D.blendMode`：`'inherit'`（默认，跟随父节点）/ `'normal'` / `'add'`；构造参数、属性、`dump`；未知值报错
- [x] 和 `modulate` 一样作用于整棵子树，子节点可以设回 `'normal'`；贴图、ColorRect、文字、粒子、图块地图都生效
- [x] 渲染测试 + `docs/examples/blend-mode.test.ts`，`llms.txt` 新增“叠加发光”小节（发光贴图怎么做、过曝、合批）
- [x] 塔防原型的火球、爆炸光圈、刀光、火花改用 `'add'`，浏览器里确认生效

## Comments

**实现（2026-10-10）：**

- 引擎只改了三处：`Node2D` 存值并在变化时 `_version++`；`PixiRenderer._syncNode` 把它写到节点容器的 `blendMode`；导出 `BlendMode` 类型。
- 选 `'inherit'` 作为默认值，是因为它正好就是 Pixi 容器的默认值：子节点的容器保持 `'inherit'`，Pixi 渲染时算出 `groupBlendMode` 往下传，所以“设在父节点上、整棵子树生效”不需要引擎自己遍历。粒子（ParticleContainerPipe）和图块地图（MeshPipe）也读 `groupBlendMode`。
- 只做了 `'add'`：验证清单只证明了叠加的需要。`multiply` / `screen` 在 WebGL 里同样是基础混合（不需要滤镜），以后需要时加进 `BLEND_MODES` 就行。
- 浏览器（Chrome）里检查了 Pixi 对象：刀光、火球、火花的内容层 `groupBlendMode` 都是 `'add'`。爆炸从“发灰的橙色一团”变成了中心亮、外圈橙色的光。
- 没有单独上真机看效果：叠加是 WebGL1 的基础混合（`blendFunc(ONE, ONE)` 类），小游戏上没有兼容问题的理由。下次真机测试时顺便看一眼。

**代码审查后的修正（2026-10-10）：**

- 文档写明 `blendMode` 和 `modulate` 一样不传进 `CanvasLayer`（界面层的容器挂在场景容器上，不在节点的 Pixi 容器下面）。
- setter 在值没变时直接返回，不触发重新同步（对象池里每次发射都会设一次）。
- 渲染测试加了 `ColorRect` 和 `Particles2D`：节点容器和内容层都保持 `'inherit'`，靠 Pixi 的 `groupBlendMode` 继承。最终按什么混合要真正渲染时才算出来，只同步不渲染的测试测不到。图块地图没加进测试（区块是自定义 shader 的 Mesh，同样读 `groupBlendMode`）。
- 塔防原型按文档推荐的写法改：火花、爆炸光圈、刀光放进一个 `blendMode: 'add'` 的 `fx` 父节点；碎片（普通混合）放在它下面一层；火球比箭高一层 `zIndex`。同类特效挨在一起绘制，不会每切换一次就打断合批。
