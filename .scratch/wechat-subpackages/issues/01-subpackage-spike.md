# 01 — 真机实验：小游戏分包

**What to build:** 在 `spikes/wechat` 里做一个最小工程：主包只有 `game.js` 和一张启动图，分包里放图片、JSON、音频，验证下面的问题，结论写进 `spikes/wechat/REPORT.md`。

**Blocked by:** None — can start immediately

**Status:** done（2026-10-11；断网失败、Android、模拟器差异没测）

- [x] 分包目录里是否必须有 `game.js`（空文件行不行）；`game.json` 的 `subpackages` 写法
- [x] `wx.loadSubpackage` 完成后，`wx.createImage().src`、`getFileSystemManager().readFile`、`InnerAudioContext.src`、`wx.loadFont` 能否用 `<分包根>/<path>` 相对路径读到分包文件
- [x] 没加载分包就读分包文件时的报错（用来写清楚的错误信息）
- [x] 下载期间帧循环 / WebGL 渲染是否正常，`onProgressUpdate` 的字段和触发频率
- [x] 第二次启动（有缓存）时 `loadSubpackage` 多快完成；删除小游戏后重装的表现
- [ ] 下载失败（断网）时的回调和能否重试
- [x] 主包、单个分包、总包的当前上限（官方文档 + 开发者工具上传时的报错）
- [ ] 模拟器和真机有哪些不一致

## Comments

**结论（2026-10-11）：** 实验在 `spikes/wechat-subpackage/`，结论见它的 `REPORT.md`。要点：分包目录必须有 `game.js`；加载后路径和主包写法一样，各种读法都正常；新版本安装后加载前能读到旧版本的分包文件，所以读之前一律先等 `loadSubpackage`；`progress` 字段不可信（iOS 上 0..1，最后一个事件是坏数据），用字节数自己算；有缓存时几毫秒完成、没有进度事件；上限主包 4 MB、单个分包不限、合计 30 MB。断网失败没测到。
