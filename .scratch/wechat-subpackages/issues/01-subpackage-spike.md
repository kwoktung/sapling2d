# 01 — 真机实验：小游戏分包

**What to build:** 在 `spikes/wechat` 里做一个最小工程：主包只有 `game.js` 和一张启动图，分包里放图片、JSON、音频，验证下面的问题，结论写进 `spikes/wechat/REPORT.md`。

**Blocked by:** None — can start immediately

**Status:** ready-for-human（需要真机 + 测试 AppID）

- [ ] 分包目录里是否必须有 `game.js`（空文件行不行）；`game.json` 的 `subpackages` 写法
- [ ] `wx.loadSubpackage` 完成后，`wx.createImage().src`、`getFileSystemManager().readFile`、`InnerAudioContext.src`、`wx.loadFont` 能否用 `<分包根>/<path>` 相对路径读到分包文件
- [ ] 没加载分包就读分包文件时的报错（用来写清楚的错误信息）
- [ ] 下载期间帧循环 / WebGL 渲染是否正常，`onProgressUpdate` 的字段和触发频率
- [ ] 第二次启动（有缓存）时 `loadSubpackage` 多快完成；删除小游戏后重装的表现
- [ ] 下载失败（断网）时的回调和能否重试
- [ ] 主包、单个分包、总包的当前上限（官方文档 + 开发者工具上传时的报错）
- [ ] 模拟器和真机有哪些不一致
