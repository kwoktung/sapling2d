# 16 — 微信构建与主循环

**What to build:** 一条命令把游戏打包成小游戏工程，用开发者工具打开就能运行节点树。这时还不需要渲染。

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] `build:wechat`（支持 `--watch`）输出单个 CommonJS 的 `game.js`，以及 `game.json`（方向配置、`iOSHighPerformance: true`）和 `project.config.json`（AppID 可以配置）
- [ ] 产物里不包含 `eval`、`new Function` 和动态 `import()`
- [ ] 最小的 WechatPlatform：rAF，以及 `now()`（把 `wx.getPerformance` 的微秒换算成毫秒）
- [ ] `sapling2d/wechat` 子路径作为入口
- [ ] 一个只有节点树的示例在开发者工具里运行，并定时在控制台打印 `dump()`
- [ ] 文档写明开发流程：开着 watch，开发者工具打开输出目录
