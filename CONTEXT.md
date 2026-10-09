# sapling2d — Context

Code-first、agent-friendly 的 2D 游戏引擎。基于 PixiJS v8（渲染）+ planck.js（Box2D 2.x 的 TS 移植，物理），默认运行在浏览器，支持微信小游戏。API 采用 Godot 风格。

## Glossary

- **Node** — 场景树中的基本单元。所有游戏对象都是 Node 的子类，通过**继承**扩展（`class Player extends RigidBody2D`）。不使用 ECS / 组件挂载。
- **Node2D** — 带 2D 变换（`position`、`rotation`、`scale`、`visible`、`zIndex`）的 Node。变换数据由节点自己持有，不是 Pixi 对象的包装。
- **Scene** — 场景树的根节点（`extends Node2D`）。通过 `static assets` 声明预加载资源；场景参数通过构造函数声明（`constructor(readonly params: {...})`）。`await tree.changeScene(SceneClass, params)` 先加载资源、再在微任务里替换（不打断当前帧），连续调用按顺序执行；旧场景独有的资源被卸载；`reloadCurrentScene()` 用原参数重开；`tree.sceneChanged` 信号。同一时间只有一个活动 Scene。
- **SceneTree** — 运行时的树与主循环拥有者。提供 `changeScene`、`paused`、`getNodesInGroup`、`focusChanged`。
- **Autoload** — 跨场景存在的全局单例节点（如 `GameState`），在启动参数 `autoloads` 中注册，用 `tree.autoload(GameState)` 按类型获取。
- **Group** — 节点的标签集合（`addToGroup` / `getNodesInGroup`），用于跨层级查找。通过声明合并 `GroupRegistry` 给组名和返回类型加强类型。**不支持** `getNode("Path")` 或 `%Unique` 路径查找；父子引用使用类型化字段。
- **Signal** — 强类型事件（`new Signal<[score: number]>()`），支持 `connect(fn, owner)` / `emit` / `await`，节点释放时自动断开（owner 为该节点的连接、该节点声明的信号）。`await signal` 会错过同步紧接着的 emit，这种情况用 `signal.wait()`。
- **Lifecycle** — `enterTree()`、`ready()`、`process(dt)`、`physicsProcess(dt)`、`exitTree()`。无下划线前缀。
- **queueFree** — 帧末延迟销毁节点。不提供立即 `free()`。物理回调期间的增删也延迟生效；`callDeferred(fn)` 用于延迟任意操作。
- **processMode** — `inherit` | `pausable` | `always`，配合 `tree.paused` 决定节点是否被暂停。暂停时 pausable 节点的 process / physicsProcess、绑定的 Tween / Timer、指针事件都停止，物理世界停止；`createTimer` 默认暂停时继续计时（`processAlways: false` 可改）。
- **Focus** — 平台的前后台事件统一为 `tree.focusChanged(focused)`。默认（`pauseOnBackground: true`）后台时挂起整个主循环，回到前台时清空物理累加器。
- **Platform** — 引擎访问外部世界的唯一接口（canvas、时间、rAF、输入事件源、资源读取、音频、存储、屏幕信息）。实现：`BrowserPlatform`、`WechatPlatform`、`HeadlessPlatform`。核心代码禁止直接访问 `window` / `document` / `wx`。
- **Headless** — 不创建渲染器、仅运行节点树与物理的模式，用于确定性测试（`createTestGame`）。
- **alpha / modulate** — `Node2D` 的外观属性：`alpha`（不透明度 0–1）和 `modulate`（颜色乘子 0xRRGGBB）作用于整个子树、父子相乘；`selfModulate` 只作用于节点自己的贴图 / 文字。补间时颜色按 RGB 通道插值。
- **Render sync** — 渲染层每帧把脏节点状态同步到懒创建的 Pixi 显示对象。用户代码不接触 Pixi 对象（逃生口：`unsafePixi`）。非 Node2D 节点不产生显示对象，其子节点挂到最近的 Node2D 祖先下。
- **Texture / tex()** — 贴图资源句柄，`tex('fruit.png')` 按路径去重；路径相对于资源目录。
- **SpriteSheet / Atlas** — 图集：一张大图切成多帧。`sheet(path, { columns, rows })` 按网格切；`atlas(path, data)` 读打包工具导出的 JSON、按名字取帧。每一帧都是 `Texture`（子区域），共用整张图的显存；加载、卸载以整张图为单位。
- **timeScale** — `tree.timeScale`：游戏时间的缩放（默认 1）。process 的 dt、物理步数、Tween、Timer、帧动画、相机平滑、`tree.time` 都乘上它；0 是打击停顿，小于 1 是慢动作。输入和渲染不受影响；`createTimer(秒, { ignoreTimeScale: true })` 按真实时间计时。和 `paused` 互相独立。
- **AnimatedSprite2D** — 帧动画精灵（继承 Sprite2D）：一套或多套命名动画（frames + fps + loop），按帧时间推进，暂停时停止。
- **Assets directory** — 游戏项目的资源放在 `<root>/public/assets/`（Vite 原样发布，页面地址 `assets/<path>`，即 `startGame` 默认的 `assetsBaseUrl`）。`tex` / `sfx` / `music` 里的路径与平台无关；微信构建时拷贝进小游戏包（工单 16/17）。`sapling2d/vite` 插件在构建和开发时检查字面量路径是否存在，缺失时报错并给出最相近的文件名；动态拼接的路径不检查。
- **Entry points** — `sapling2d`（核心，无 Pixi、无 DOM）、`sapling2d/browser`（`startGame`）、`sapling2d/wechat`（`startGame`）、`sapling2d/testing`（`createTestGame`）、`sapling2d/vite`（`sapling()` 资源校验、`saplingWechat()` 小游戏构建、`startLogServer()`）。`sapling2d/vite` 由 Node 原生加载，其内部相对导入必须带 `.ts` 扩展名。
- **Physics step** — 固定 60Hz 的物理步进：每步先调用所有节点的 `physicsProcess`，再 `world.step`，再把刚体位置写回节点。每帧最多补 2 步。step 期间世界锁定，增删刚体一律延迟。
- **PhysicsBody2D** — `RigidBody2D`（dynamic）、`StaticBody2D`；形状来自 `CollisionShape2D` 子节点（`circle(r)`、`rectangle(w, h)`）。刚体位置以 planck 为准；给 position / rotation 赋值等于瞬移并清零速度。默认 friction 0.5、bounce 0、mass 1 kg。刚体在进入树后的第一个物理步才创建，之前设置的速度和冲量会排队。
- **CollisionObject2D** — `PhysicsBody2D` 和 `Area2D` 的基类，持有形状、碰撞层和 `bodyEntered` / `bodyExited` 信号。接触信号在 `world.step` 之后派发，回调里可以安全地 add / remove / queueFree。
- **Area2D** — 传感器区域（planck 的 kinematic + sensor），跟随自身及祖先的全局变换，只检测 RigidBody2D（检测不到静态刚体和其他区域）。
- **HitTester** — 不走 planck 的命中判定：`forEachHit(as, bs, hit)` 比较两组对象（`x`、`y`、`hitShape` 为 `circle` / `rectangle`）的每一对，只回答谁和谁重叠，没有物理反应。形状轴对齐、不随 scale 变化，比较的是局部坐标。和 `Area2D` 的区别：不是节点、不发信号、由游戏在 `process` 里主动调用，用于数量超出刚体预算的子弹和道具。
- **TileSet / tileset()** — 图块集：一张图集贴图按 `tileSize` 切成格子，图块编号从 1 开始（0 表示空格子），每个图块可以有碰撞类型（`solid` / `oneWay`）和自定义字段。是一种资源，放进 `static assets` 预加载；一个图块集只对应一张图（ADR 0008）。
- **TiledMap / tiledMap()** — Tiled 关卡资源（导出的 JSON）。加载时读关卡文件和外部图块集（`Platform.loadText`），再加载图块集图片；`createLayers()` 生成 TileMapLayer，`objects()` 返回对象层的数据，由游戏自己创建节点。图块的字符串属性 `collision`（`solid` / `oneWay`）映射到碰撞类型。不支持的 Tiled 特性在加载时报错。
- **TileMapLayer** — 一层图块地图（`Node2D`）：大小固定的格子数组（`Uint16Array`），多层地图就是多个节点。渲染按 16 × 16 格的区块，每个区块一个 Mesh，只画屏幕内的区块（ADR 0008）。不生成物理刚体；碰撞由 `CharacterBody2D` 直接查格子（ADR 0009）。
- **CharacterBody2D** — 由代码控制移动的角色（平台游戏的主角、敌人）：在 `physicsProcess` 里设置速度、调用 `moveAndSlide()`，按轴分离的格子扫掠和 TileMapLayer 碰撞（ADR 0009）。和 `RigidBody2D` 的区别：不是 planck 刚体，没有物理反应，`StaticBody2D` 挡不住它、planck 世界感知不到它；和 `HitTester` 的区别：它负责被地形挡住，角色和敌人、道具之间的命中仍用 `HitTester`。
- **Camera2D** — 相机：当前相机的全局位置是画面中心，场景和 Autoload 随之平移（只平移，不缩放、不旋转）。支持 `offset`、`limit*` 边界、平滑跟随；同一时间一个当前相机。在每帧所有 `process` 之后更新。
- **ColorRect** — 纯色矩形（继承 Node2D）：`size`、`color`，原点在左上角（和 Godot 一样）。用于血条、遮罩、转场黑幕；渲染时是白色贴图染色，和贴图一起合批。
- **CanvasLayer** — 界面层（`Node`，不是 Node2D）：下面的节点不跟随相机、用设计坐标，全局变换和可见性在这里断开。`layer` < 0 画在场景下面、>= 0 画在上面，拾取顺序相同。用于 HUD、按钮、暂停菜单、远景。
- **World coordinates** — 节点的全局坐标。没有相机时等于设计坐标；有相机时 世界坐标 + 相机偏移 = 设计坐标。指针事件的坐标是世界坐标（CanvasLayer 里的节点收到设计坐标）；`viewport.screenToWorld` / `worldToScreen` / `visibleWorldRect`。
- **Timer / SceneTreeTimer** — `Timer` 节点（`waitTime`、`oneShot`、`autostart`、`timeout` 信号），每帧最多触发一次、循环不漂移；一次性等待用 `await this.tree.createTimer(1).timeout`。
- **Tween** — `this.createTween().to(target, props, duration, ease).parallel().wait(s).call(fn)`，绑定节点销毁时自动停止（不触发 `finished`）。从下一帧开始播放；每一步的起始值在该步开始时读取；同一个 `to()` 里的多个属性同时进行。`to(this, ...)` 在类方法里按 Node2D 的属性做类型检查。
- **Engine-internal hooks** — 引擎节点通过 `_onEnterTree` / `_onExitTree` / `_internalProcess` 实现自身行为，用户覆写 `enterTree` / `exitTree` / `process` 时不需要调用 super。
- **Design resolution / Viewport** — 设计分辨率（默认 750×1334），游戏坐标都以它为准。`this.tree.viewport` 提供 `visibleRect`、`safeRect`、`screenToDesign` 和 `resized` 信号。`expand`（默认）等比缩放、多出的空间向两侧**对称**扩展（与 Godot 向右下扩展不同）；`keep` 裁剪到设计区域。渲染分辨率 = min(DPR, 2)。
- **Input** — `this.tree.input`。平台原始事件在每帧开始时统一处理（确定性）。`isActionJustPressed` 在 `process` 里按帧、在 `physicsProcess` 里按物理步算（和 Godot 一样，高刷新率下不丢按键）。动作在启动参数 `actions` 中定义（`key('Space')`、`pointerPress()`），动作名可通过声明合并 `ActionRegistry` 加强类型。
- **TouchScreenButton** — 屏幕按钮（虚拟按键，继承 Sprite2D）：手指按住时让一个输入动作处于按下状态，和键盘绑定共用动作名；每个手指独立，滑出、抬起、取消、切到后台都会松开。按在按钮上的手指不参与节点拾取，也不触发 `pointerPress()`。
- **TouchJoystick** — 虚拟摇杆（继承 Node2D）：手指拖动时按方向和力度（0–1）驱动四个方向的输入动作，游戏用 `input.getVector(...)` 读取，和键盘共用动作名。`dynamic`（在区域里按下的地方出现）或 `fixed`；只认一个手指。
- **Action strength** — 输入动作的力度（0–1）：数字输入（按键、`pointerPress()`、屏幕按钮）是 1，摇杆是推动的程度；力度 ≥ 0.5 时动作算按下。
- **Pointer picking** — `inputPickable` 加 `hitArea`（Sprite2D 默认用贴图范围）的节点会收到 `pointerDown` / `pointerMove` / `pointerUp` / `clicked`；只有绘制顺序最上层的节点收到；按下后该指针被节点捕获。被节点处理掉的按下不触发 `pointerPress()` 动作。
- **Audio** — `this.tree.audio`。资源用 `sfx(path)`（预解码，可叠加）和 `music(path)`（流式）声明。一次性音效 `tree.audio.play(stream, { volume, loop, bus })` 返回 Voice；节点用 `AudioStreamPlayer`（同一时间一个声音，离开树时停止）。平台只实现很薄的 `AudioBackend`。浏览器在第一次手势时自动解锁：之前请求的音乐排队，音效丢弃。后台时挂起。
- **Audio bus** — `Master` / `Music` / `SFX` 三条音量总线，音量是 0–1 线性值（不是 Godot 的 dB）；实际音量 = 声音 × 总线 × Master，静音为 0。
- **Storage** — `this.tree.storage.get(key, default)` / `set` / `remove` / `has` / `keys` / `clear`，同步、JSON、自动加前缀（默认 `sapling2d:`，`storagePrefix` 可改）。数据损坏或类型与默认值不一致时返回默认值。key 和值可通过声明合并 `StorageRegistry` 加类型。平台只实现 `StorageBackend`（浏览器 localStorage，不可用时退回内存）。
- **dump** — 场景树的文本转储（缩进文本，可选 JSON），供 agent 观察游戏状态。

## Conventions

- 单位：像素、y 轴向下、弧度（另有 `rotationDegrees`）、重力 px/s²。
- `Vector2` 不可变；修改位置须重新赋值（`node.position = node.position.add(...)`），或使用 `node.x` / `node.y`。
- `Sprite2D` 默认 `centered = true`。
- 碰撞使用 `collisionLayer` / `collisionMask`（32 位，第 1–32 层）。规则与 Godot 相同：任一方的 mask 包含对方的 layer 就碰撞（不是 Box2D 的“双方都要匹配”），通过覆写 planck fixture 的 `shouldCollide` 实现。
- 物理内部单位为米，按 `pixelsPerMeter`（默认 50）换算；对外 API 一律为像素。
