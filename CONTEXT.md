# sapling2d — Context

Code-first、agent-friendly 的 2D 游戏引擎。基于 PixiJS v8（渲染）+ planck.js（Box2D 2.x 的 TS 移植，物理），默认运行在浏览器，支持微信小游戏。API 采用 Godot 风格。

## Glossary

- **Node** — 场景树中的基本单元。所有游戏对象都是 Node 的子类，通过**继承**扩展（`class Player extends RigidBody2D`）。不使用 ECS / 组件挂载。
- **Node2D** — 带 2D 变换（`position`、`rotation`、`scale`、`visible`、`zIndex`）的 Node。变换数据由节点自己持有，不是 Pixi 对象的包装。
- **Scene** — 场景树的根节点（`extends Node2D`）。通过 `static assets` 声明预加载资源，用 `tree.changeScene(SceneClass, params)` 切换。同一时间只有一个活动 Scene。
- **SceneTree** — 运行时的树与主循环拥有者。提供 `changeScene`、`paused`、`getNodesInGroup`、`focusChanged`。
- **Autoload** — 跨场景存在的全局单例节点（如 `GameState`）。
- **Group** — 节点的标签集合（`addToGroup` / `getNodesInGroup`），用于跨层级查找。**不支持** `getNode("Path")` 或 `%Unique` 路径查找；父子引用使用类型化字段。
- **Signal** — 强类型事件（`new Signal<[score: number]>()`），支持 `connect` / `emit` / `await`，节点释放时自动断开。
- **Lifecycle** — `enterTree()`、`ready()`、`process(dt)`、`physicsProcess(dt)`、`exitTree()`。无下划线前缀。
- **queueFree** — 帧末延迟销毁节点。不提供立即 `free()`。物理回调期间的增删也延迟生效；`callDeferred(fn)` 用于延迟任意操作。
- **processMode** — `inherit` | `pausable` | `always`，配合 `tree.paused` 决定节点是否被暂停。
- **Platform** — 引擎访问外部世界的唯一接口（canvas、时间、rAF、输入事件源、资源读取、音频、存储、屏幕信息）。实现：`BrowserPlatform`、`WechatPlatform`、`HeadlessPlatform`。核心代码禁止直接访问 `window` / `document` / `wx`。
- **Headless** — 不创建渲染器、仅运行节点树与物理的模式，用于确定性测试（`createTestGame`）。
- **Render sync** — 渲染层每帧把脏节点状态同步到懒创建的 Pixi 显示对象。用户代码不接触 Pixi 对象（逃生口：`unsafePixi`）。
- **Physics step** — 固定 60Hz 的物理步进，由引擎驱动 `world.step`。step 期间世界锁定，增删刚体一律延迟。
- **Design resolution** — 设计分辨率（如 750×1334），配合 stretch aspect（默认 `expand`）适配屏幕；暴露 safe area。
- **Audio bus** — `Master` / `Music` / `SFX` 三条音量总线。
- **dump** — 场景树的文本转储（缩进文本，可选 JSON），供 agent 观察游戏状态。

## Conventions

- 单位：像素、y 轴向下、弧度（另有 `rotationDegrees`）、重力 px/s²。
- `Vector2` 不可变；修改位置须重新赋值（`node.position = node.position.add(...)`），或使用 `node.x` / `node.y`。
- `Sprite2D` 默认 `centered = true`。
- 碰撞使用 `collisionLayer` / `collisionMask`（目标 32 位，M3 验证；不可行则 16 位），映射到 planck 的 `filterCategoryBits` / `filterMaskBits`。
- 物理内部单位为米，按 `pixelsPerMeter`（默认 50）换算；对外 API 一律为像素。
