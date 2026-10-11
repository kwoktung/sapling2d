# 03 — 小游戏资源分包

**What to build:** `saplingWechat` 把启动资源留在主包、其余资源放进一个分包；`WechatPlatform` 按构建时生成的主包清单决定直接读还是先等分包。游戏代码不变。

**Blocked by:** 01、02

**Status:** done（2026-10-11）

- [x] 构建：`public/assets/boot/**`（`mainAssets` 选项可改，接受 glob 或函数）拷到主包，其余拷到分包目录（目录名和是否需要入口文件按 01 的结论）；`game.json` 写 `subpackages`
- [x] 主包文件清单：构建时内联进 `game.js`（虚拟模块或 define），运行时用 Set 查
- [x] `WechatPlatform`：`loadImage` / `loadText` / 音频 / `loadFont` 统一通过一个路径解析函数——在清单里就读主包路径，否则先等分包（`wx.loadSubpackage` 只调用一次，缓存 Promise）再读分包路径
- [x] 实现 02 的 `prepareAssets(onProgress)`：触发分包下载并汇报 `onProgressUpdate`；有缓存时立即完成
- [x] 启动页（`loading` 场景）的资源不在主包时报错，说明文件名和 `boot/` 目录（或 `mainAssets`）
- [x] 下载失败：按 01 的结论处理（至少给出清楚的错误，不要卡在 0%）
- [x] 每次构建都清掉上次留下的旧资源目录（`emptyOutDir: false` 是为了保留 `project.private.config.json`，资源目录要自己清）
- [x] Tiled 扩展名的警告、`sapling()` 的资源检查照旧
- [x] `examples/wechat-tree` 加一张 `boot/` 图片，在模拟器里跑通；AGENTS.md 的 WeChat 一节和 `llms.txt` 写明 `boot/` 约定
- [x] 单元测试：资源分配（主包 / 分包）和路径解析函数（用假的 `wx`）
- [x] `pnpm check` 通过

## Comments

**实现（2026-10-11）：**

- 构建（`src/vite/wechat.ts`）：`planAssets()` 把资源分到主包（`mainAssets`，默认 `'boot/**'`，glob 或函数，`mainAssetsMatcher()`）和分包。主包资源拷到 `assets/`，其余拷到 `assets-sub/`（分包名 `assets`，自动生成入口 `assets-sub/game.js`）；每次构建先删掉这两个目录。没有分包资源时 `game.json` 不写 `subpackages`。
- 清单：虚拟模块 `__sapling2d_wechat_assets__` 在虚拟入口里最先导入，写 `GameGlobal.__saplingAssets = JSON.parse("…")`（`{ main, subpackage }`）。清单在构建开始时生成；watch 模式下 `boot/` 里增删文件时警告要重新构建。
- 运行时（`src/platform/wechat/assets.ts` 的 `WechatAssetPaths`）：`resolve(path)`（异步，分包里的先等下载完）、`resolveNow(path)`（同步，音乐和 `loadFont` 用；分包没下载完时报错）、`prepare(onProgress)`（`WechatPlatform.prepareAssets`）。只调用一次 `wx.loadSubpackage`；失败时隔 1 秒重试，最多 2 次；进度按字节数算、只增不减、忽略坏事件，结束时补一个 1。`prepare` 之前请求分包里的资源 → 报错并指向 `boot/`。没有清单时都在 `assets/`（兼容旧构建和测试）。
- `WechatPlatform.loadImage` / `loadText`、`WechatAudioBackend`（音效异步、音乐同步）、`loadFont` 都通过它。
- `examples/wechat-tree`：启动页用 `boot/logo.png`，入口场景的贴图和音效在分包里。真机（iPhone 17）发布构建：临时放了一个 3 MB 的文件进分包，启动页显示后 1.57 秒资源就绪，之后 60 fps。
- 测试：`test/wechat-assets.test.ts`（9 个，假 wx：路径、启动页报错、只下载一次、进度、缓存、重试、失败、音频）；`test/wechat-build.test.ts` 加 3 个（主包 / 分包布局、清单、没有分包、删掉的资源不残留、glob）。
- 其余有小游戏构建的示例（merge、plane、platformer、spinblade、sprite、towerdefense）都能构建，资源全部进分包；没有示例在 startGame 完成前读资源。
- 没做：Android 真机、断网失败的真实表现。
