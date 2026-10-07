# Spec: sapling2d MVP

Status: needs-triage
Date: 2026-10-07

术语见 `CONTEXT.md`，关键决策见 `docs/adr/0001`–`0005`。

## 目标

1. Code-first、对 agent 友好的 2D 游戏引擎
2. 渲染用 PixiJS v8，物理用 planck.js，平台层分为 Browser、Wechat、Headless
3. 日常开发在 web 上进行，最后在小游戏环境里调试
4. Godot 风格的节点树、生命周期和信号
5. 包含音频、Tween、Timer、存储等基础系统

验证游戏是**合成大西瓜类**：点击投放水果，同类碰撞后合成，计分、记录最高分，游戏结束后可以重开。

## 范围

### MVP 节点

`Node`、`Node2D`、`Scene`、`Sprite2D`、`Label`、`RigidBody2D`、`StaticBody2D`、`Area2D`、`CollisionShape2D`（矩形、圆、多边形）、`Timer`、`Tween`、`AudioStreamPlayer`

### 不在 MVP 内

`Camera2D`、`AnimatedSprite2D`、`CharacterBody2D`、`AnimatableBody2D`、UI 控件、TileMap、粒子、Shader、`BitmapLabel`、`AudioStreamPlayer2D`、截图、资源代码生成、分包、叠加场景、可插拔物理后端

## API 草图

```ts
class GameScene extends Scene {
  static assets = { fruit: tex("fruit.png"), pop: sfx("pop.mp3") }
  dropper!: Dropper
  ready() {
    this.dropper = this.add(new Dropper({ position: v(375, 150) }))
  }
}

class Fruit extends RigidBody2D {
  readonly merged = new Signal<[level: number]>()
  ready() {
    this.addToGroup("fruits")
    this.bodyEntered.connect((other) => {
      if (other instanceof Fruit && other.level === this.level) {
        this.queueFree(); other.queueFree()
        this.merged.emit(this.level + 1)
      }
    })
  }
}

tree.changeScene(GameOverScene, { score })
```

## 核心语义

- 生命周期依次为 `enterTree`、`ready`、`process(dt)`、`physicsProcess(dt)`（固定 60Hz）、`exitTree`。
- `this.add(child)` 返回带类型的子节点。节点之间靠类型化字段、Groups 和 Autoload 互相引用，不支持路径查找。
- `Signal<T>` 有类型，支持 `connect`、`emit` 和 `await`，节点释放时自动断开。
- `queueFree()` 在帧末执行。物理 step 期间的增删、建刚体都延迟生效。另外提供 `callDeferred(fn)`。
- 暂停用 `tree.paused` 配合 `processMode`（`inherit`、`pausable`、`always`）。切后台时触发 `focusChanged`，默认暂停主循环、挂起音频，并重置时间累加器。
- 数据归属：
  - `Node2D` 自己持有变换数据，渲染层把脏节点同步到懒创建的 Pixi 对象。
  - `RigidBody2D` 以 planck 为权威；用户设置 `position` 时瞬移刚体并清空速度。
- `Vector2` 不可变。单位为像素、y 轴向下、弧度，重力单位为 px/s²（默认 980）。物理内部按 `pixelsPerMeter = 50` 换算成米。
- `Sprite2D` 默认 `centered`。
- 屏幕适配：设计分辨率加 `expand` 拉伸；暴露安全区；DPR 上限为 2。
- 碰撞层用 `collisionLayer` 和 `collisionMask`，信号为 `bodyEntered` 和 `bodyExited`。
- 输入：
  - 浏览器 pointer 事件和 `wx.onTouch*` 统一成同一套 Pointer 输入，由引擎自己做命中测试。
  - InputMap 动作通过 `Input.isActionPressed` 查询。
  - 键盘只在 web 端生效。
- 音频：
  - 主 API 是 `AudioStreamPlayer` 节点，`Audio.play(...)` 是语法糖。
  - 三条总线：Master、Music、SFX。
  - 音效走 WebAudio（浏览器的 `AudioContext`，小游戏的 `wx.createWebAudioContext`），预先解码成 buffer。
  - 音乐流式播放（`HTMLAudioElement` 或 `InnerAudioContext`）。
  - 首次触摸时自动解锁音频。
  - 格式统一用 mp3。
- Tween：
  - 写法为 `this.createTween().to(target, {props}, dur, ease).parallel().call(fn)`，属性有类型约束。
  - 节点销毁时自动停止；`finished` 是可以 await 的 Signal。
- `Timer` 是节点，`timeout` 是 Signal。
- 存储：同步的 `Storage.get` 和 `Storage.set`，值做 JSON 序列化。底层分别是 `localStorage`、`wx.*StorageSync`，无头模式用内存实现。
- 资源：在 `static assets` 里手写路径，由 Vite 插件在构建时校验文件是否存在。

## 对 agent 友好的能力

```ts
const g = await createTestGame({ main: GameScene, seed: 1 })
g.tap(375, 200)
g.step(120)
expect(g.tree.getNodesInGroup("fruits")).toHaveLength(1)
console.log(g.dump())
```

- 无头运行不创建渲染器：时间由 step 驱动，`rand()` 带 seed，测试中的资源加载是同步的或被 mock。
- `dump()` 默认输出缩进文本，可选 JSON。
- 提供 `llms.txt`、给游戏项目用的 `AGENTS.md`，以及可运行的示例。
- 严格 TS 类型，API 面尽量小。

## 平台层

- `Platform` 接口提供：canvas、`now()`、rAF、输入事件源、`loadImage`、读文件和 fetch、音频、存储，以及屏幕信息（尺寸、DPR、安全区、方向）。
- 实现有 `BrowserPlatform`、`WechatPlatform` 和 `HeadlessPlatform`。核心代码禁止访问 `window`、`document` 和 `wx`。
- 微信端（ADR 0001）：
  - 用自定义 `DOMAdapter` 实现那 9 个方法，再补上 rAF、`performance`（微秒换算成毫秒）、canvas `addEventListener` stub 和 `WebGLRenderingContext`。
  - 引入 `pixi.js/unsafe-eval`，设置 `skipExtensionImports`，不使用 Pixi 的 EventSystem。
  - 资源加载关闭 ImageBitmap、Worker 和格式检测，显式构造 `ImageSource`。
  - 为 `Label` 的 `measureText` 缺失字段写 polyfill。
  - 最低基础库 ≥ 2.25，只走 WebGL1，默认开启 `iOSHighPerformance`。

## 工程

- pnpm monorepo，TypeScript、Vite、Vitest。
- 包结构：`packages/engine`、`packages/wechat`，以及 `examples/merge`。
- 对外发布为单包 `sapling2d`，子路径有 `sapling2d/wechat`、`sapling2d/testing` 和 `sapling2d/vite`。
- 微信构建：`build:wechat --watch` 打出单个 CommonJS 的 `game.js`，同时输出 `game.json` 和 `project.config.json`，再用微信开发者工具打开输出目录。

## 里程碑

| # | 内容 | 完成标准 |
|---|---|---|
| M0 | WeChat spike（暂不写引擎） | 在开发者工具和真机上，用 Pixi v8 加自定义 DOMAdapter 画出精灵和文字（含 `measureText` 检查）、播放 WebAudio 音效、接收触摸、跑通 planck；对比 iOS 普通模式与高性能模式 |
| M1 | 核心逻辑无头跑通 | 节点树、Signal、主循环、HeadlessPlatform、`createTestGame`、`dump` 都有测试覆盖 |
| M2 | 浏览器渲染 | BrowserPlatform、渲染同步（`Sprite2D`、`Label`）、Pointer 输入、Vite 开发环境、屏幕适配 |
| M3 | 物理 | `RigidBody2D`、`StaticBody2D`、`Area2D`、`CollisionShape2D`，碰撞信号，延迟增删；验证碰撞层能否用 32 位 |
| M4 | 系统 | `Timer`、`Tween`、音频（含总线和解锁）、`Storage` |
| M5 | 微信正式版 | WechatPlatform 加 `sapling2d/vite` 构建插件 |
| M6 | 验证游戏 | 合成大西瓜在 web 和真机上都跑通；完成 `llms.txt`、`AGENTS.md` 和示例 |

M0 需要用户本机装好微信开发者工具，并提供 AppID（测试号也可以）。

## 待验证的风险

- WeChat 的 `measureText` 是否返回 `actualBoundingBox*`（M0）
- `WebGLRenderingContext` 的 `instanceof` 检测在 WeChat 上的替代方案（M0）
- iOS 普通模式下的性能（M0）
- planck 的过滤位能否按 32 位工作（M3）
- Promise 在 iOS 15 及以下是基于 setTimeout 的 polyfill，会影响 `await signal` 的时序（M1 设计时需要考虑）
