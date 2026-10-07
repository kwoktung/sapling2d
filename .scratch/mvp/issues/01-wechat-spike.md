# 01 — WeChat spike：Pixi v8 加 planck 跑通小游戏

**What to build:** 一个用完即弃的 spike（不写引擎），确认 Pixi v8 加自定义 DOMAdapter 和 planck 能在微信小游戏里运行，把所有坑记录下来。spike 要验证的点见 ADR 0001 和 ADR 0005。

**Blocked by:** None — can start immediately

**Status:** ready-for-human（需要微信开发者工具、AppID（测试号也可以）和真机；代码可以由 agent 写，运行和观察必须由人来做）

- [ ] 用单个 CommonJS 的 `game.js` 在开发者工具里启动，初始化 Pixi v8（WebGL1，引入 `unsafe-eval`，设置 `skipExtensionImports`）
- [ ] 画出一张包内图片做成的精灵，显式构造 ImageSource
- [ ] 画出一段 canvas Text，记录 `measureText` 是否返回 `actualBoundingBox*`；如果不返回，验证 polyfill 方案
- [ ] 用 `wx.createWebAudioContext` 播放一个 mp3 音效，并验证音频需要在首次触摸时解锁
- [ ] `wx.onTouchStart` 能收到坐标，并能换算成画布坐标
- [ ] planck 刚体下落并堆叠，显示在画面上
- [ ] 在 iOS 和 Android 真机上各跑一次；在 iOS 上对比普通模式和 `iOSHighPerformance` 的帧率
- [ ] 写一份 spike 报告，列出必需的 polyfill 和 shim、发现的问题和对应的解决方式（比如 `WebGLRenderingContext` 的 instanceof 问题、`performance` 的单位），作为 17、18 的输入
