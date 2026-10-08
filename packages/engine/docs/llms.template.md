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

启动参数（三个入口通用）：`main`（入口场景类）、`autoloads`、`actions`、`design`（默认 750×1334、`expand`）、`physics`、`seed`、`storagePrefix`、`pauseOnBackground`；浏览器和小游戏另有 `background`。

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

### 信号

<!-- example:signals -->

<!-- example:signals#test -->

### Groups 与 Autoload

<!-- example:groups-autoload -->

### 输入

<!-- example:input -->

<!-- example:input#test -->

### 物理与碰撞（合成玩法）

<!-- example:physics -->

<!-- example:physics#test -->

### 检测区域

<!-- example:area -->

### 计时器与补间

<!-- example:timer-tween -->

### 帧动画与图集

<!-- example:animation -->

<!-- example:animation#test -->

- `sheet(path, { columns, rows })`：等大格子的网格图集，`frame(i)` / `frames(start, end)`（含两端）/ `count`。帧尺寸 = 整张图尺寸 / 列数（行数），图片加载后才确定，无头模式下为 0。
- `atlas(path, data)`：打包图集，`data` 是 TexturePacker 等工具导出的 JSON（Hash 或 Array 格式，直接 import）。`get(name)` / `frames(prefix)`（数字自然排序）/ `names` / `has`。尺寸来自 JSON，无头模式下也正确；支持裁剪透明边（trimmed），不支持旋转打包。
- 图集的帧就是 `Texture`，可以给任何 `Sprite2D`；同一张图的帧共用一份显存，绘制时能合批。`static assets` 里放 `sheet` / `atlas`，切换场景时按整张图判断是否卸载。
- `AnimatedSprite2D`：`frames` + `fps`（默认 10）+ `loop`（默认 true），或 `animations: { 名字: { frames, fps, loop } }`。`play(name?)` / `pause()` / `stop()`（回到第 0 帧）、`frame`（可赋值）、`frameCount`、`speedScale`、`isPlaying`、`animation`；信号 `frameChanged`、`animationFinished`（不循环的动画播完，参数是动画名）。`texture` 由动画控制，不要直接赋值。

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
| `CollisionShape2D` | 碰撞形状（必须是刚体 / 区域的直接子节点） | `shape`：`circle(r)` `rectangle(w, h)` `polygon(points)`；`disabled` |
| `Timer` | 计时器 | `waitTime` `oneShot` `autostart` `start()` `stop()` `timeLeft`；信号 `timeout` |
| `AudioStreamPlayer` | 播放声音 | `stream` `volume` `loop` `bus` `autoplay` `play()` `stop()`；信号 `finished` |

碰撞层：`collisionLayer` / `collisionMask`（32 层，`setCollisionLayerValue(n, bool)`），规则同 Godot：任一方的 mask 包含对方的 layer 就碰撞。

## 测试：`createTestGame`

```ts
const g = await createTestGame({ main: GameScene, seed: 1, screen?, storage?, autoloads?, actions?, design? })
```

| 成员 | 说明 |
|---|---|
| `g.scene` / `g.tree` / `g.game` | 当前场景、场景树、游戏对象 |
| `g.step(n)` / `g.stepSeconds(s)` | 推进 n 帧（每帧 1/60 秒，恰好一个物理步）；结果确定 |
| `g.dump()` / `g.dump({ json: true })` | 场景树文本：每行 `名字 (类名) 属性=值`，缩进表示层级，取默认值的属性省略（见下表） |
| `g.tap(x, y)` / `g.drag(from, to, { frames })` / `g.pressKey(code)` | 模拟输入（设计坐标），走和真实平台相同的路径；`tap` 推进 2 帧 |
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
- 示例：`examples/merge`（合成大西瓜，含无头测试）、`examples/physics`、`examples/sprite`；项目模板：`templates/game`。
