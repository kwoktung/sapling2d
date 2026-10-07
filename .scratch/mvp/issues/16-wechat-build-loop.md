# 16 — 微信构建与主循环

**What to build:** 一条命令把游戏打包成小游戏工程，用开发者工具打开就能运行节点树。这时还不需要渲染。

**Blocked by:** 01, 02

**Status:** done（2026-10-07）。构建基于 Vite（`saplingWechat()` 插件），不是独立 CLI；在开发者工具模拟器中验证，真机验证随工单 17。

- [x] `build:wechat`（支持 `--watch`）输出单个 CommonJS 的 `game.js`，以及 `game.json`（方向配置、`iOSHighPerformance: true`）和 `project.config.json`（AppID 可以配置）
- [x] 产物里不包含 `eval`、`new Function` 和动态 `import()`
- [x] 最小的 WechatPlatform：rAF，以及 `now()`。`wx.getPerformance().now()` 在真机上是微秒、在模拟器里是毫秒（实测），必须在运行时检测单位
- [x] 内置调试能力：在 `game.js` 最前面注入启动日志和 `wx.onError`，再加一个可选的局域网日志服务（spike 里验证过这套方案）
- [x] release 构建压缩代码、不带 sourcemap（带内联 sourcemap 会超过 4MB，真机预览上传失败）
- [x] `sapling2d/wechat` 子路径作为入口
- [x] 一个只有节点树的示例在开发者工具里运行，并定时在控制台打印 `dump()`
- [x] 文档写明开发流程：开着 watch，开发者工具打开输出目录
