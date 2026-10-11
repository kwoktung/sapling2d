# 02 — 启动页 + 加载进度

**What to build:** 启动时先显示一个启动页场景，资源加载完再切到入口场景；加载进度给游戏读。浏览器和无头测试里就能验证，不依赖分包。

```ts
startGame({ main: Menu, loading: Splash })

class Splash extends Scene {
  static assets = { logo: tex('boot/logo.png') }
  process() {
    this.bar.scaleX = this.tree.loadProgress // 0..1
  }
}
```

**Blocked by:** None — can start immediately

**Status:** done（2026-10-11）

- [x] 启动参数 `loading?: SceneClass`（三个入口通用）。`Game.create` 的流程：加载 `loading` 的资源 → 让它进入树 → **开始帧循环** → 准备资源包（平台可选的钩子，见下）→ 加载 `main` 的资源 → 切到 `main`。现在 `startGame` 在 `Game.create` 之后才 `start()`，要改成启动页显示后就开始跑帧
- [x] 平台接口加一个可选的准备步骤（例如 `Platform.prepareAssets?(onProgress)`），浏览器和无头平台不实现；03 里小游戏用它下载分包。进度按比例并进 `loadProgress`（比例写死一处，例如准备 70% + 加载 30%，没有准备步骤时加载占 100%）
- [x] `tree.loadProgress`：只读，0..1。`loadAssets` 按资源个数（已完成 / 总数）汇报；`changeScene` 期间同样更新，加载完为 1。不在帧循环里分配内存
- [x] 不传 `loading` 时使用内置默认启动页：`ColorRect` 背景 + 进度条 + 可选的 `Label`，不引用任何资源；背景色跟 `background` 启动参数
- [x] 启动页想多停一会儿（最短显示时间、点击继续）：给一个简单的办法，例如启动页场景可以实现 `ready()` 返回 Promise 或提供 `this.tree` 上的等待接口——实现时选最简单、和现有 API 一致的一种，写进 spec 的“已定”
- [x] 加载失败时（资源 404 等）错误不被吞掉：和现在一样抛出，启动页停留在原地
- [x] 测试：无头模式下用一个慢的假平台验证顺序（启动页先进入树、帧在跑、进度单调增加到 1、最后切到 `main`、启动页被销毁、启动页独有的资源被卸载）
- [x] `docs/examples/` 加启动页示例，`pnpm --filter sapling2d llms` 重新生成；`templates/game` 不改（内置进度条已经够用）
- [x] `pnpm check` 通过

## Comments

**实现（2026-10-11）：**

- `GameOptions.loading?: SceneClass<Scene & LoadingScreen> | null`：不传用 `DefaultLoadingScene`（`src/runtime/DefaultLoadingScene.ts`，两个 `ColorRect`，按 `designRect` 居中），`null` 不显示。
- `Game.create` 新增内部参数 `start`：启动页进入树后立即 `game.start()`；浏览器和小游戏的 `startGame` 传 `start: true`，不再自己调 `start()`。
- 启动顺序：`changeScene(loading)` → `start()` → `platform.prepareAssets?.()`（进度 0..0.7）→ `loadAssets(main.assets)`（0.7..1，没有准备步骤时 0..1）→ `await loaded()` → `changeScene(main)`（资源已加载，在微任务里完成）。
- 最短显示时间 / 点击继续：启动页实现 `loaded(): void | Promise<void>`（导出类型 `LoadingScreen`）。只在有帧循环（`start: true`）时等它，否则等计时器的 `loaded()` 在无头测试里永远完成不了。
- `Platform.prepareAssets?(onProgress)`：可选，浏览器和无头平台不实现，03 里由 `WechatPlatform` 实现。
- `tree.loadProgress`：`SceneTree` 的字段，`changeScene` 开始时置 0，`loadAssets` 每完成一个资源回调一次（按个数），完成后置 1；启动时 Game 用 `_setLoadProgress` 设置。
- `createTestGame` 默认 `loading: null`；传入时启动页直接跳过。
- 测试：`test/loading-scene.test.ts`（7 个：顺序和帧循环、进度、prepareAssets 的比例、`loaded()`、加载失败、默认进度条和 `null`、changeScene 的进度）；`docs/examples/loading-screen.test.ts`；`llms.txt` 新增“启动页”一节。
- 浏览器里跑了 towerdefense 示例，启动正常。
