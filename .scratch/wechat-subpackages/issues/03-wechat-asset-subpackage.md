# 03 — 小游戏资源分包

**What to build:** `saplingWechat` 把启动资源留在主包、其余资源放进一个分包；`WechatPlatform` 按构建时生成的主包清单决定直接读还是先等分包。游戏代码不变。

**Blocked by:** 01、02

**Status:** ready-for-agent（01 完成后）

- [ ] 构建：`public/assets/boot/**`（`mainAssets` 选项可改，接受 glob 或函数）拷到主包，其余拷到分包目录（目录名和是否需要入口文件按 01 的结论）；`game.json` 写 `subpackages`
- [ ] 主包文件清单：构建时内联进 `game.js`（虚拟模块或 define），运行时用 Set 查
- [ ] `WechatPlatform`：`loadImage` / `loadText` / 音频 / `loadFont` 统一通过一个路径解析函数——在清单里就读主包路径，否则先等分包（`wx.loadSubpackage` 只调用一次，缓存 Promise）再读分包路径
- [ ] 实现 02 的 `prepareAssets(onProgress)`：触发分包下载并汇报 `onProgressUpdate`；有缓存时立即完成
- [ ] 启动页（`loading` 场景）的资源不在主包时报错，说明文件名和 `boot/` 目录（或 `mainAssets`）
- [ ] 下载失败：按 01 的结论处理（至少给出清楚的错误，不要卡在 0%）
- [ ] 每次构建都清掉上次留下的旧资源目录（`emptyOutDir: false` 是为了保留 `project.private.config.json`，资源目录要自己清）
- [ ] Tiled 扩展名的警告、`sapling()` 的资源检查照旧
- [ ] `examples/wechat-tree` 加一张 `boot/` 图片，在模拟器里跑通；AGENTS.md 的 WeChat 一节和 `llms.txt` 写明 `boot/` 约定
- [ ] 单元测试：资源分配（主包 / 分包）和路径解析函数（用假的 `wx`）
- [ ] `pnpm check` 通过
