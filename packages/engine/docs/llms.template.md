# sapling2d

> Code-first、对 agent 友好的 2D 游戏引擎：PixiJS v8 渲染 + planck.js（Box2D）物理，API 采用 Godot 风格（节点树、生命周期、信号）。平时在浏览器里开发，同一份代码构建成微信小游戏。场景树可以在 Node 里无头运行、按帧确定性推进，适合写测试和让 agent 观察游戏状态。

本文件由 `scripts/build-llms.ts` 生成，示例代码来自 `docs/examples/*.test.ts`（都是能跑的测试）。修改请改模板和示例，然后运行 `pnpm llms`。

## 入口

| 导入 | 用途 |
|---|---|
| `sapling2d` | 节点、数学、资源、物理、音频、存储……（不含渲染和平台代码，可以在 Node 里运行） |
| `sapling2d/browser` | `startGame(options)`：在浏览器里启动 |
| `sapling2d/wechat` | `startGame(options)`：在微信小游戏里启动；另有 `loadFont`、`snapshot` |
| `sapling2d/testing` | `createTestGame(options)`：无头运行，测试用 |
| `sapling2d/vite` | `sapling()` 资源路径检查；`saplingWechat()` 构建小游戏；`startLogServer()` 接收真机日志 |

启动参数（三个入口通用）：`main`（入口场景类）、`autoloads`、`actions`、`design`（默认 750×1334、`expand`）、`physics`、`seed`、`storagePrefix`、`pauseOnBackground`、`pixelArt`（见“贴图与文字”，无头模式下没有效果）；浏览器和小游戏另有 `background`。

## 核心概念

- **节点树**：游戏对象都继承节点类（`Node`、`Node2D`、`Sprite2D`、`RigidBody2D`……），用 `this.add(child)` 组成树；`add` 返回带类型的子节点。节点之间用类型化字段、Groups 和 Autoload 互相引用，**不支持按路径查找**。
- **生命周期**：`enterTree()`（父先于子）→ `ready()`（子先于父，一生一次）→ 每帧 `process(dt)` / 固定 60Hz 的 `physicsProcess(dt)` → `exitTree()`（子先于父）。覆写时不需要调用 `super`。
- **场景**：`Scene` 是树的根，同一时间一个。`static assets` 声明的资源在 `ready()` 之前加载完成；场景参数通过构造函数声明，用 `this.tree.changeScene(Cls, params)` 切换。
- **场景树**：`this.tree` 提供 `input`、`audio`、`storage`、`physics`、`viewport`、`rng`、`paused`、`createTween()`、`createTimer()`、`getNodesInGroup()`、`autoload()`、`changeScene()`、`dump()`；时间：`time`（游戏时间，秒，按物理步累计，暂停时不走）、`physicsFrames`、`processFrames`。节点不在树里时访问 `this.tree` 会抛错（构造函数里不要用）。
- **构造参数**：每个节点的构造函数接受一个选项对象，键就是它可写的属性：通用的 `name`、`groups`、`processMode`；`Node2D` 的 `position`、`rotation`、`scale`、`visible`、`zIndex`、`alpha`、`modulate`、`selfModulate`、`inputPickable`、`hitArea`；再加各节点自己的属性（如 `Label` 的 `text`（默认 `''`）、`fontSize`，`RigidBody2D` 的 `mass`、`bounce`）。
- **单位与坐标**：像素、y 轴向下、弧度（另有 `rotationDegrees`）、重力 px/s²。游戏坐标是设计分辨率（默认 750×1334）；`expand` 模式下屏幕多出来的部分向两侧对称扩展，贴边的 UI 用 `this.tree.viewport.visibleRect` / `safeRect`。
- **每帧顺序**：处理输入队列（指针信号在这里触发）→ 若干次物理步（每步：所有节点的 `physicsProcess`，再推进物理世界、写回刚体位置、派发接触信号）→ `process` → Tween / Timer → `callDeferred` → `queueFree`。每帧最多补 2 个物理步。

## 示例

### 快速开始

<!-- example:quickstart -->

测试（无头、确定性）：

<!-- example:quickstart#test -->

### 贴图与文字

<!-- example:sprite-label -->

像素风游戏（小图放大显示）在启动参数里设 `pixelArt: true`：所有贴图用最近邻采样，放大后不模糊；绘制时精灵的每个顶点对齐到物理像素，缩放倍数不是整数时也没有半像素的模糊边缘。文字不受影响。
只影响画面，节点的 `position` 照常是小数。对齐是按顶点做的，缩放倍数不是整数时有两个代价：
- 移动中的精灵宽度可能在相邻两个物理像素之间跳动；
- 旋转或缩放中的精灵，四个角各自对齐，形状会轻微抖动。像素风游戏里尽量不要旋转、缩放精灵。

要完全避免，就让设计分辨率按整数倍放大到屏幕。

### 信号

<!-- example:signals -->

<!-- example:signals#test -->

### Groups 与 Autoload

<!-- example:groups-autoload -->

### 输入

<!-- example:input -->

<!-- example:input#test -->

`isActionJustPressed` / `isActionJustReleased` 在 `process` 里按帧算；在 `physicsProcess`（以及刚体的接触信号）里按物理步算（上一个物理步之后按下的，在下一个物理步里为 true）。屏幕刷新率高于 60Hz 时有的帧没有物理步，所以在 `physicsProcess` 里处理跳跃这类按键不会丢。

### 屏幕按钮（虚拟按键）

<!-- example:touch-buttons -->

- `TouchScreenButton`（继承 Sprite2D）：手指按住时 `action` 处于按下状态，和键盘绑定共用动作名（`isActionPressed` / `isActionJustPressed` 照常用）。信号 `pressed` / `released`，`isPressed`，`texturePressed` 按下时换图。
- 触摸区域：`hitArea`（可以比贴图大，推荐），否则用贴图范围。每个手指独立；滑出按钮、抬起、触摸取消、切到后台都会松开。`passbyPress: true` 时手指滑进来也算按下（方向键）。
- 和 `pointerPress()` 的区别：`pointerPress()` 是“屏幕上任意一处没被节点处理的按下”（点屏幕开始游戏）；屏幕按钮只认自己的区域，按在按钮上的手指**不会**触发 `pointerPress()`，也不会点中下面的节点。
- 放进 `CanvasLayer` 固定在屏幕上；隐藏、暂停（不能处理）时按不下，按着的会在下一帧松开。按绘制顺序参与拾取：画在它上面的可点击节点（例如更高层的对话框）先收到指针。
- 从空白处滑进 `passbyPress` 按钮的手指从此不算 `pointerPress()` 的按下；正在拖着节点的手指滑过按钮不会按下它。
- `action` 应该是已定义的动作（可以是没有绑定的 `[]`）；未定义时打印警告，按钮照常显示但不影响任何动作。

### 物理与碰撞（合成玩法）

<!-- example:physics -->

<!-- example:physics#test -->

### 检测区域

<!-- example:area -->

### 命中判定（不走物理引擎）

子弹、道具这类数量多、只需要知道“碰没碰到”的对象用 `HitTester`：对象有 `x`、`y` 和 `hitShape`（`circle(r)` 或 `rectangle(w, h)`）就能参与，没有物理反应，也不占刚体预算。形状以节点位置为中心，**不随 rotation / scale 变化**；`x` / `y` 是局部坐标，所以互相比较的对象要挂在同一个父节点下（或父节点之间没有相对变换）。`dead` 为 true、已 `queueFree()` 或已销毁的对象自动跳过（只看对象自己：父节点 `queueFree()` 时，子节点到帧末销毁后才跳过）。`as` 和 `bs` 可以传同一个数组做组内判定，对象不和自己比较。

<!-- example:hit-tester -->

### 计时器与补间

<!-- example:timer-tween -->

### 帧动画与图集

<!-- example:animation -->

<!-- example:animation#test -->

- `sheet(path, { columns, rows })`：等大格子的网格图集，`frame(i)` / `frames(start, end)`（含两端）/ `count`。帧尺寸 = 整张图尺寸 / 列数（行数），图片加载后才确定，无头模式下为 0。
- `atlas(path, data)`：打包图集，`data` 是 TexturePacker 等工具导出的 JSON（Hash 或 Array 格式，直接 import）。`get(name)` / `frames(prefix)`（数字自然排序）/ `names` / `has`。尺寸来自 JSON，无头模式下也正确；支持裁剪透明边（trimmed），不支持旋转打包。
- 图集的帧就是 `Texture`，可以给任何 `Sprite2D`；同一张图的帧共用一份显存，绘制时能合批。`static assets` 里放 `sheet` / `atlas`，切换场景时按整张图判断是否卸载。
- `AnimatedSprite2D`：`frames` + `fps`（默认 10）+ `loop`（默认 true），或 `animations: { 名字: { frames, fps, loop } }`。`play(name?)` / `pause()` / `stop()`（回到第 0 帧）、`frame`（可赋值）、`frameCount`、`speedScale`、`isPlaying`、`animation`；信号 `frameChanged`、`animationFinished`（不循环的动画播完，参数是动画名）。`texture` 由动画控制，不要直接赋值。

### 图块地图（TileMap）

<!-- example:tilemap -->

- `tileset(path, { tileSize, tiles, columns?, margin?, spacing? })`：图块集，放进 `static assets` 预加载。图块编号从 1 开始（图集左上角是 1，从左到右、从上到下），0 表示空格子。
  `tiles` 给图块定义属性：`collision`（`'solid'` 整格实心 / `'oneWay'` 单向平台）和 `data`（游戏自己的字段）；`tileSet.tile(id)` 读取。
- `TileMapLayer`：一层格子，大小（`width × height` 格）创建后固定，格子左上角在节点原点；多层地图就是多个节点，叠放顺序看场景树。
  `setCell(cx, cy, id)` / `eraseCell` / `getCell`（地图外返回 0）/ `getCellTileData`（图块属性，空格子为 null）/ `localToMap`（像素 → 格子）/ `mapToLocal`（格子 → 格子中心的像素）/ `getUsedRect`（单位是格）/ `usedCellCount`。
- 一个图块集只能用一张图；图块不能翻转、旋转，没有动画。碰撞只有整格，没有斜坡。图层可以平移，不要旋转、缩放（碰撞按格子查）。
- 渲染只画屏幕内的区块（16 × 16 格），改格子很便宜（顶碎砖块直接 `eraseCell`）。几万格的关卡也只是一个节点，不要用 Sprite2D 一格一格地拼。
- 图块地图不生成物理刚体：`RigidBody2D` 不会被它挡住。

### Tiled 关卡

<!-- example:tiled -->

- `tiledMap(path)`：Tiled 的 JSON 格式关卡，放在资源目录里，图块集（嵌入的或外部的 JSON 图块集）和图片按 Tiled 里的相对路径放，都要在资源目录里。
  **扩展名用 `.json`**（Tiled 保存时可以选）：微信小游戏的代码包可能不收 `.tmj` / `.tsj`，构建时会警告。XML 格式（`.tmx` / `.tsx`）不支持。
  放进 `static assets` 加载；切换场景时图片按张判断是否卸载（两个关卡共用的图不会被卸载）。vite 插件检查关卡文件和它引用的图块集、图片，开发时改了关卡文件也会重新检查。
- `createLayers()`：每个图块层一个新的 `TileMapLayer`（名字、偏移、可见性、不透明度来自 Tiled），按从下到上的顺序；`createLayer(name)`；`layerNames`；`layerProperties(name)`（图层的自定义属性）。
- `objects(layerName?)`：对象层的数据 `{ id, name, type, x, y, width, height, rotation, shape, points, gid, tileSet, flipH, flipV, properties, layer }`（`gid` 是在 `tileSet` 里从 1 开始的编号）。矩形、点的 (x, y) 是左上角 / 点本身，**图块对象是左下角**（Tiled 的约定）。`objectLayers`、`properties`（地图属性）。
- `width` / `height`（格）、`tileSize`、`pixelWidth` / `pixelHeight`（设相机 limit 用）、`tileSets`。
- 在 Tiled 里设置碰撞：图块集编辑器里选中图块，加**字符串**属性 `collision`，值 `solid`（实心）或 `oneWay`（单向平台）；其他属性进 `getCellTileData(...).data`。
  Tiled 碰撞编辑器里画的形状**不起作用**（会警告）。图块层加整数属性 `collisionLayer` 设置碰撞层（默认 1）。
- 限制（加载时报错，指出图层或图块集）：只支持正交、非无限地图；图块是正方形、和地图格子一样大；每个图块集一张图片；一个图块层只用一个图块集；不能翻转、旋转图块；图块层格式用 CSV（Map Properties → Tile Layer Format）；不支持图层组、图片图层。动画图块只画第一帧（会警告）。
- 无头测试读真实文件：`createTestGame({ ..., assetsDir })`（默认 `public/assets`，相对于当前工作目录）。

### 平台游戏的角色（CharacterBody2D）

<!-- example:character-body -->

- `CharacterBody2D`：代码控制移动的角色。`shape` 是 `rectangle(w, h)`（以节点位置为中心、轴对齐、不随 rotation / scale 变化）。
  每个物理步设置速度（`velocityX` / `velocityY` / `setVelocity(x, y)`，或 `velocity`），调用 `moveAndSlide()`：先 x 后 y 移动，被实心格挡住时贴着格子停下、那一轴的速度清零。
- 结果：`isOnFloor` / `isOnWall` / `isOnCeiling`；`slideCollisionCount` / `getSlideCollision(i)`（`tileMap`、`cellX`、`cellY`、`normal`；对象会复用）。
- 单向平台（`collision: 'oneWay'`）只在下落、且脚底原来在平台顶面以上时挡住。速度再快也不会穿墙。`collisionMask` 和图层的 `collisionLayer` 有交集才碰撞。
- 重力、加速度、跳跃由游戏自己写；重力每一步都要加（站在地上也加），否则 `isOnFloor` 为 false。
- `moveAndSlide()` 只能在 `physicsProcess` 里调用。`physicsProcess` 里的 `isActionJustPressed` 按物理步算，一次按下只在一个物理步里为 true。
- 限制：**只和 TileMapLayer 的格子碰撞**。它不是刚体：`StaticBody2D` 挡不住它（重叠时会打印一次警告），`RigidBody2D` / `Area2D` 感知不到它。墙和地面都画进图块地图。
  没有斜坡。碰撞盒不随角色自己的 rotation / scale 变化（翻转贴图用子节点 Sprite2D 的 `flipH`）；角色的祖先、图层和图层的祖先只能平移（旋转、缩放会报错）。
  角色之间不互相阻挡：主角和敌人、金币之间用 `HitTester` 判断。图块集里没有任何碰撞图块的图层（纯装饰）不参与碰撞。

### 相机（Camera2D）

<!-- example:camera -->

- 当前相机的全局位置就是画面中心，场景和 Autoload 都随它平移。通常挂在玩家下面。场景里第一个启用（`enabled`，默认 true）的相机自动成为当前相机，`makeCurrent()` 切换，`isCurrent` 查询；当前相机被移除或关掉时换下一个，都没有时画面不偏移。
- `offset`：画面中心相对相机的偏移。`limitLeft` / `limitTop` / `limitRight` / `limitBottom`：画面不超出的世界范围（范围比画面小时，画面中心固定在范围中心）。
- `positionSmoothingEnabled` + `positionSmoothingSpeed`（默认 5）：平滑跟随；瞬移后调用 `resetSmoothing()`。`screenCenter` 是应用了边界和平滑后的画面中心。
- 相机在所有节点的 `process` 之后更新，暂停时平滑停住；画面只平移，不支持缩放和旋转。相机的位置是真正的全局位置（挂在 `scale.x = -1` 的角色下面时局部位置会镜像，`offset` 不会）。开了 `pixelArt` 时画面偏移对齐到物理像素。
- 坐标：节点的全局坐标和指针事件的坐标（`position`、`pointerPosition`）都是**世界坐标**；没有相机时世界坐标就是设计坐标。
  `tree.viewport.screenToWorld` / `worldToScreen` 换算窗口坐标，`designToWorld` / `worldToDesign` 换算设计坐标（屏幕上的位置）；`visibleWorldRect` 是屏幕上可见的世界范围（`visibleRect` 是设计坐标）。
  手指按住不动而相机移动时，`pressedPointers` / `pointerPosition` 每帧按新的相机位置更新。
- 有相机时，固定在屏幕上的界面（分数、按钮）要放在 `CanvasLayer` 里，否则会跟着画面一起移走。

### 界面层（CanvasLayer）

<!-- example:canvas-layer -->

- `CanvasLayer`（不是 Node2D）下面的节点不跟随相机，用设计坐标（屏幕上的位置），仍然随视口缩放。全局变换只算到 CanvasLayer 为止。
- `layer`（默认 1）：>= 0 画在场景上面（界面），< 0 画在场景下面（远景）；同一层级按场景树里的顺序（嵌套的层紧跟外层）。上面的层先收到指针事件。
  `visible = false` 时整层（包括嵌套在里面的层）不显示、不能被点中。CanvasLayer 外面的 Node2D 隐藏**不影响**它（和 Godot 一样）：要跟着角色一起隐藏的血条不要放进 CanvasLayer。
- 它下面的节点收到的指针事件 `position` 是设计坐标；场景里的节点收到的是世界坐标。
- 属于场景的 CanvasLayer 随场景销毁；需要跨场景的界面（例如全局 HUD）让 Autoload 继承 CanvasLayer。
- 刚体、`CharacterBody2D`、`TileMapLayer` 也可以放进 CanvasLayer，坐标同样是设计坐标；`CharacterBody2D` 只和同一画布（同一个 CanvasLayer，或都在场景里）的图块地图碰撞。

### 场景切换与存档

<!-- example:scenes-storage -->

<!-- example:scenes-storage#test -->

### 音频

<!-- example:audio -->

<!-- example:audio#test -->

### 暂停

<!-- example:pause -->

## 补间的控制

- `createTween()` 返回的 Tween 可以 `kill()`（立即停止，不触发 `finished`），`isRunning` 表示是否还在播放；链式方法有 `to`、`parallel`、`wait(秒)`、`call(fn)`。
- 两个 Tween 同时改同一个属性时都会运行，每帧后创建的那个最后写入（覆盖前一个）。反复触发的动效（比如每次连击都弹一下）应先停掉上一个：

```ts
#pop: Tween | null = null
pop() {
  this.#pop?.kill()
  this.scale = v(1.6, 1.6)
  this.#pop = this.createTween().to(this, { scale: v(1, 1) }, 0.25, Ease.BackOut)
}
```

## 透明度与颜色

`Node2D` 有三个外观属性，都可以写在构造参数里、也都可以补间：

| 属性 | 默认 | 作用范围 | 说明 |
|---|---|---|---|
| `alpha` | `1` | 自己和子节点 | 不透明度 0–1（超出截断），父子相乘。为 0 时仍能被点中，要隐藏用 `visible` |
| `modulate` | `0xffffff` | 自己和子节点 | 颜色乘子 0xRRGGBB：每个像素乘上它。`0xff6666` 偏红、`0x888888` 变暗；只能变暗或偏色，不能变亮 |
| `selfModulate` | `0xffffff` | 只有自己的贴图 / 文字 | 同上，但不影响子节点（如 Boss 变红而血条不变）；与 `modulate` 叠乘 |

```ts
// 受伤变红再恢复：颜色属性按 RGB 通道补间
enemy.modulate = 0xff4040
enemy.createTween().to(enemy, { modulate: 0xffffff }, 0.2)
// 淡出后销毁
fx.createTween().to(fx, { alpha: 0 }, 0.3).call(() => fx.queueFree())
```

## 节点清单

| 节点 | 用途 | 关键成员 |
|---|---|---|
| `Node` | 基类 | `add` `remove` `queueFree` `callDeferred` `addToGroup` `createTween` `processMode` `tree` |
| `Node2D` | 带变换 | `position` `x` `y` `rotation` `scale` `visible` `zIndex` `alpha` `modulate` `selfModulate` `globalPosition` `toLocal` `toGlobal`；`inputPickable` `hitArea` + 信号 `pointerDown` `pointerMove` `pointerUp` `clicked` |
| `Scene` | 场景根 | `static assets` |
| `Sprite2D` | 贴图 | `texture` `centered`（默认 true）`offset` `flipH` `flipV` |
| `AnimatedSprite2D` | 帧动画（继承 Sprite2D） | `frames` / `animations` `fps` `loop` `autoplay` `play()` `pause()` `stop()` `frame` `speedScale` `isPlaying` `animation`；信号 `frameChanged` `animationFinished` |
| `Label` | 文字 | `text` `fontSize` `color` `fontWeight` `align` `verticalAlign` `stroke` `wrapWidth` `lineHeight` |
| `RigidBody2D` | 动态刚体 | `mass` `friction` `bounce` `gravityScale` `linearVelocity` `angularVelocity` `lockRotation` `ccd` `applyCentralImpulse` `applyForce` `sleeping`；信号 `bodyEntered` `bodyExited` |
| `StaticBody2D` | 静态刚体（地面、墙） | `friction` `bounce` |
| `Area2D` | 检测区域 | 信号 `bodyEntered` `bodyExited`；`getOverlappingBodies()` |
| `TileMapLayer` | 一层图块地图 | `tileSet` `width` `height` `collisionLayer` `setCell` `eraseCell` `getCell` `getCellTileData` `localToMap` `mapToLocal` `getUsedRect` `usedCellCount` |
| `CharacterBody2D` | 平台游戏的角色（只和图块地图碰撞） | `shape` `velocity` `velocityX` `velocityY` `setVelocity` `moveAndSlide()` `isOnFloor` `isOnWall` `isOnCeiling` `slideCollisionCount` `getSlideCollision(i)` `collisionMask` |
| `Camera2D` | 相机（画面跟随） | `enabled` `offset` `limitLeft` `limitTop` `limitRight` `limitBottom` `positionSmoothingEnabled` `positionSmoothingSpeed` `makeCurrent()` `isCurrent` `resetSmoothing()` `screenCenter` |
| `CanvasLayer`（不是 Node2D） | 界面层（不跟随相机） | `layer` `visible` |
| `TouchScreenButton` | 屏幕按钮（继承 Sprite2D） | `action` `texturePressed` `passbyPress` `isPressed` `hitArea`；信号 `pressed` `released` |
| `TiledMap`（资源，不是节点） | Tiled 关卡 | `tiledMap(path)`；`createLayers()` `createLayer(name)` `objects(layer?)` `objectLayers` `layerNames` `width` `height` `tileSize` `pixelWidth` `pixelHeight` `tileSets` `properties` |
| `HitTester`（不是节点） | 两组对象之间的圆 / 矩形命中判定 | `forEachHit(as, bs, hit)`（`hit` 返回 true 表示 a 用掉了）、`HitTester.compact(list)`；对象需要 `x` `y` `hitShape`，可选 `dead` |
| `CollisionShape2D` | 碰撞形状（必须是刚体 / 区域的直接子节点） | `shape`：`circle(r)` `rectangle(w, h)` `polygon(points)`；`disabled` |
| `Timer` | 计时器 | `waitTime` `oneShot` `autostart` `start()` `stop()` `timeLeft`；信号 `timeout` |
| `AudioStreamPlayer` | 播放声音 | `stream` `volume` `loop` `bus` `autoplay` `play()` `stop()`；信号 `finished` |

碰撞层：`collisionLayer` / `collisionMask`（32 层，`setCollisionLayerValue(n, bool)`），规则同 Godot：任一方的 mask 包含对方的 layer 就碰撞。

## 测试：`createTestGame`

```ts
const g = await createTestGame({ main: GameScene, seed: 1, screen?, storage?, autoloads?, actions?, design?, assetsDir? })  // assetsDir：文本资源（Tiled 关卡）从这里读真实文件，默认 public/assets
```

| 成员 | 说明 |
|---|---|
| `g.scene` / `g.tree` / `g.game` | 当前场景、场景树、游戏对象 |
| `g.step(n)` / `g.stepSeconds(s)` | 推进 n 帧（每帧 1/60 秒，恰好一个物理步）；结果确定 |
| `g.dump()` / `g.dump({ json: true })` | 场景树文本：每行 `名字 (类名) 属性=值`，缩进表示层级，取默认值的属性省略（见下表） |
| `g.tap(x, y)` / `g.drag(from, to, { frames })` / `g.pressKey(code)` | 模拟输入（设计坐标，也就是屏幕上的位置；有相机时节点收到的是对应的世界坐标），走和真实平台相同的路径；`tap` 推进 2 帧 |
| `g.pointerDown/Move/Up(x, y, id?)` / `g.keyDown/keyUp(code)` | 只注入事件，下一次 step 处理 |
| `g.setScreen(info)` / `g.setFocus(bool)` | 模拟换屏幕、切后台 |
| `g.audio.log` / `g.audio.playing` / `g.audio.finishAll()` | 播放记录（无头不发声） |
| `g.platform.storage` | 内存存储；`createTestGame({ storage: { best: 10 } })` 预置存档 |

`dump` 中各节点显示的属性（只在不等于默认值时出现）。值的格式：向量 `position=(220, 200)`、布尔 `visible=false`、数字 `zIndex=3`、含空格的字符串加引号 `text="连击 ×2"`、数组 `groups=[coins]`。

| 节点 | 属性 |
|---|---|
| 所有节点 | `groups`、`processMode` |
| `Node2D` 及子类 | `position`（总是显示）、`rotationDegrees`、`scale`、`visible`、`zIndex`、`alpha`、`modulate` / `selfModulate`（`#ff6666` 形式） |
| `Sprite2D` | `texture`（路径；图集的帧是 `sprites.png#enemy_red` / `explosion.png#3`）、`centered`、`offset`、`flipH`、`flipV` |
| `AnimatedSprite2D` | 同 Sprite2D，加 `animation`（有多套时）、`frame`（总是显示）、`playing` |
| `Label` | `text`（总是显示，含空格时加引号）、`fontSize`、`align` |
| `RigidBody2D` | `mass`、`friction`、`bounce`、`linearVelocity`（运动时）、`sleeping`、`collisionLayer`、`collisionMask` |
| `StaticBody2D` / `Area2D` | `friction`、`bounce`（静态刚体）、`collisionLayer`、`collisionMask` |
| `CollisionShape2D` | `shape`（如 `circle(30)`）、`disabled` |
| `Timer` | `waitTime`、`oneShot`、`timeLeft`、`stopped` |
| `AudioStreamPlayer` | `stream`、`playing`、`loop`、`volume` |

游戏自己的节点可以覆写 `protected dumpProps()`，加入关键状态（如 `level`），方便测试和 agent 观察：`return { ...super.dumpProps(), level: this.level }`。

无头模式不渲染：贴图宽高为 0（需要点击区域时显式设置 `hitArea`）。`changeScene` 在微任务里完成：`await` 它的返回值，或 `await new Promise(r => setTimeout(r, 0))`。

## 微信小游戏

- 构建：`saplingWechat({ entry: 'src/main.wechat.ts' })`，`vite build -c vite.wechat.config.ts [--watch]`，用微信开发者工具打开 `dist-wechat/`。环境变量：`WX_APPID`、`SAPLING_RELEASE=1`（真机预览必须，压缩、无 sourcemap）、`SAPLING_LOG_URL=http://<局域网 IP>:7777/log`（把 console、错误和 `snapshot()` 截图发到 `startLogServer()`）。
- 资源放在 `public/assets/`，构建时拷贝进小游戏包；`tex('a.png')` 在两个平台上路径相同。
- 只用 WebGL1；iOS 小游戏可能没有 JIT：同时活跃的刚体控制在 60–80 个以内。模拟器和真机差异很大，以真机为准。
- 小游戏没有键盘；触摸是多点的。`loadFont(path)` 加载包内字体（只在小游戏里）。

## 性能（微信小游戏 iOS）

iOS 小游戏基本没有 JIT，而且**分配内存（对象、数组、闭包、迭代器）特别贵**；读写普通字段、getter、`Map.get` 并不慢。弹幕、粒子这类每帧处理几百个对象的代码按下面写（实测数据见 `spikes/bullets/REPORT.md`）：

- **碰撞判定先把位置读进局部变量或数组**，内层循环只做算术，不要反复读 `node.x` / `node.position`：

```ts
const ex = this.ex, ey = this.ey // 预先分配的 Float64Array
for (let j = 0; j < enemies.length; j++) { ex[j] = enemies[j]!.x; ey[j] = enemies[j]!.y }
for (let i = 0; i < bullets.length; i++) {
  const b = bullets[i]!
  const bx = b.x, by = b.y // 每颗子弹只读一次
  for (let j = 0; j < enemies.length; j++) {
    const dx = bx - ex[j]!, dy = by - ey[j]!
    if (dx * dx + dy * dy <= r2) { /* 命中 */ break }
  }
}
```

- 数量再大（几百 × 几百）时按网格分桶，只和同一格及相邻格比较。
- **移动用 `node.x += …` / `node.y += …`**：不分配对象。`node.position = node.position.add(…)` 每次分配两个 Vector2。
- 热循环里用下标循环，少用 `for…of`、`map` / `filter`、箭头函数和展开运算符（都会分配）。
- 子弹等大量对象不要用 `RigidBody2D` / `Area2D`（iOS 上同时活跃的刚体建议在 60–80 个以内），用 `HitTester` 做命中判定。
- 每帧都要跑的类不要用 `#private`（见下面的常见陷阱）。

## 常见陷阱

- **测试通过不等于类型检查通过**：Vitest 不做类型检查。改完代码运行 `pnpm check`（= `tsc` + `vitest run`），两者都通过才算完成。
- **严格的数组索引**：tsconfig 开启了 `noUncheckedIndexedAccess`，`arr[i]` 的类型是 `T | undefined`。确定存在时写 `arr[i]!`（示例里的 `balls[0]!` 就是这个原因），不确定时先判断。

- **Vector2 不可变**：`node.position.x += 1` 是错的（编译不过）；写 `node.x += 1` 或 `node.position = node.position.add(v(1, 0))`。
- **`queueFree` 在帧末执行**：调用后本帧内节点仍在树里；用 `isQueuedForDeletion` 防止重复处理（比如两个水果互相收到 `bodyEntered`）。
- **物理回调里的增删**：接触信号在物理步之后派发，回调里 `queueFree` / `add` 都安全；新刚体在下一个物理步才创建，之前设置的速度和冲量会排队。
- **改碰撞形状会重新触发接触信号**：移动、改变、禁用或增删一个刚体的 `CollisionShape2D` 时，引擎会重建它的形状，正在接触它的对象会先收到一次 `bodyExited`、再收到一次 `bodyEntered`。需要稳定的进出判断时，尽量在节点创建时定好形状，不要在接触中修改。
- **刚体的位置由物理决定**：给 `RigidBody2D` 的 `position` 赋值等于瞬移并清零速度；`scale` 不影响碰撞形状。
- **不支持路径查找**：没有 `getNode('A/B')`；用字段（`this.player = this.add(...)`）、`getNodesInGroup` 或 `autoload`。
- **发布构建会压缩类名**：节点不传 `name` 时默认用类名，但真机发布包里类名会被压缩（变成 `cP` 之类）。逻辑里不要依赖默认名字或 `constructor.name`：要按名字找就显式传 `name`，判断类型用 `instanceof`。
- **`this.tree` 只在树里可用**：不要在构造函数里用；放到 `ready()`。
- **`await signal` 会错过同步紧接着的 emit**：先注册再触发时用 `signal.wait()`。
- **带类型的 AnimatedSprite2D**：`AnimatedSprite2D<'fly' | 'hurt'>` 不能赋给 `AnimatedSprite2D`（即 `<string>`）类型的变量或数组；字段按具体类型声明，或在用到的地方写 `AnimatedSprite2D<any>`。
- **每帧都要跑的类不要用 `#private`**：小游戏构建目标是 ES2017，`#x` 会被编译成 WeakMap 查找，iOS 上慢 2–3 倍（ADR 0006）。用 TS 的 `private _x`。
- **随机数**：用 `this.tree.rng`（带 seed，测试可复现），不要用 `Math.random`。
- **声明合并**：给组名、动作名、存档 key 加类型：`declare module 'sapling2d' { interface GroupRegistry { … } interface ActionRegistry { … } interface StorageRegistry { … } }`。
- **Tween 在类方法里**：`this.createTween().to(this, {...})` 按 `Node2D` 的属性做类型检查；补间子类特有的属性写 `to(this as MyNode, …)`。
- **音量是 0–1**（不是 dB）；`tree.paused` 不暂停声音。

## 更多

- 术语表：仓库根目录 `CONTEXT.md`；架构决策：`docs/adr/`；微信环境实测：`spikes/wechat/REPORT.md`。
- 示例：`examples/merge`（合成大西瓜，含无头测试）、`examples/plane`（飞机大战：图集、帧动画、用 HitTester 做碰撞、暂停）、`examples/platformer`（横版跳跃：Tiled 关卡、CharacterBody2D、Camera2D、CanvasLayer 的 HUD、屏幕按钮、像素风、横屏）、`examples/physics`、`examples/sprite`；项目模板：`templates/game`。
