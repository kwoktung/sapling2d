# 17 — 微信渲染与资源

**What to build:** 04 和 05 的示例在微信开发者工具里显示得和浏览器一样。

**Blocked by:** 16, 04, 05

**Status:** ready-for-agent

- [ ] 按 01 spike 的结论实现 DOMAdapter 的 9 个方法；引入 `unsafe-eval`，设置 `skipExtensionImports`，手动导入所需的 Pixi 模块，选择 WebGL1
- [ ] 按 spike 报告第 2 节逐项实现：WebGL 版本一律用 `Symbol.hasInstance` 按 API 特征判断；在 WebGL1 上把 5 参数的 `bufferSubData` 改写为 3 参数（否则 iOS 上约 1 秒后画面冻结）；在 Pixi 加载前补上 `Intl`、`navigator`、canvas `addEventListener`
- [ ] iOS 上会出现“不支持 32 位索引”的警告，降级为 debug 日志
- [ ] 资源加载用 `wx.createImage` 并显式构造 ImageSource，关闭 ImageBitmap、Worker 和格式检测；JSON 类资源通过文件系统读取
- [ ] 构建时把资源拷贝进小游戏工程，路径和 web 端一致
- [ ] 基于 `wx.getWindowInfo` 做屏幕适配，包括 DPR 和安全区
- [ ] `Sprite2D` 示例在开发者工具里正确显示，并会旋转
