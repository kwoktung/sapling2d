# Spike 01 报告：Pixi v8 + planck 跑在微信小游戏上

日期：2026-10-07
结论：**可行。** Pixi v8.22.0 加 planck 1.5.0，配合自定义 DOMAdapter 和下面这些补丁，在开发者工具、iOS 真机和 Android 真机上都跑通了：渲染、文字、物理、触摸、WebAudio 音效和 InnerAudioContext BGM 全部正常。

## 测试环境

| 环境 | 屏幕 | 结果 |
|---|---|---|
| 开发者工具模拟器（NW.js） | 390×844 @3x | 54–56 fps |
| iOS 真机，`iOSHighPerformance: true`，基础库 3.17.3 | 402×874 @3x | 60 fps，2 drawcall |
| Android 真机 | 400×870 @3x | 约 56 fps，交互正常 |

**没测完的**：iOS 高性能模式是否真的带来 JIT，还缺“关闭调试 + 普通模式”的对照组（见第 8 节）。

## 关键发现

### 1. 模拟器和真机的环境差异很大，必须上真机验证

| 全局对象 | 模拟器 | iOS 真机 | Android 真机 |
|---|---|---|---|
| `window`、`document`、`navigator`、`performance` | 有 | 无 | 无 |
| `TextDecoder`、`WebGLRenderingContext` | 有 | 无 | 无 |
| `Intl` | 有 | 有 | **无** |
| 上屏 canvas 的 `addEventListener` | 有 | 无 | 无 |
| `fetch`、`Image`、`createImageBitmap`、`WebAssembly` | 无 | 无 | 无 |
| `requestAnimationFrame`、`Proxy`、`Symbol.hasInstance`、`WXWebAssembly` | 有 | 有 | 有 |

### 2. 需要的补丁和 shim（正式引擎的 WechatPlatform 必须全部实现）

| # | 问题 | 现象 | 处理方式 |
|---|---|---|---|
| 1 | Pixi 用 `gl instanceof getWebGLRenderingContext()` 判断 WebGL 版本 | wx 返回的 GL 上下文是包装对象，**模拟器里也判断失败**，被当成 WebGL2，`texImage2D` 走 9 参数分支后崩溃 | `getWebGLRenderingContext()` 返回一个带 `Symbol.hasInstance` 的对象，按“有没有 `createVertexArray`”判断版本，**无论原生构造器存不存在都这么做** |
| 2 | Pixi 在 WebGL1 上也调用 5 参数的 `bufferSubData(target, offset, data, srcOffset, length)` | iOS 真机上 buffer 不再更新，**画面在约 1 秒后冻结**（buffer 停止扩容之后才出现），物理照常运行 | 包装上屏 canvas 的 `getContext('webgl')`，在 WebGL1 上把 5 参数调用改写为 `bufferSubData(target, offset, data.subarray(srcOffset, srcOffset + length))` |
| 3 | Android 没有 `Intl`，Pixi 的 `CanvasTextMetrics` 在模块加载时执行 `typeof Intl?.Segmenter` | 启动即报 `ReferenceError: Intl is not defined` | 在 Pixi 加载之前补 `globalThis.Intl = {}` |
| 4 | 计时单位 | `wx.getPerformance().now()`：**真机是微秒，模拟器是毫秒**（实测比值约 1000 和约 1） | `performance.now()` 不能写死除以 1000；要在运行时检测单位，或者统一用真机行为并对模拟器特判 |
| 5 | `measureText` 不返回 `actualBoundingBox*`（iOS 和 Android 都一样；只有 `fontBoundingBoxAscent/Descent`） | 文字框高度 22 对比模拟器的 24.35，肉眼看可以接受 | 补齐字段：`actualBoundingBoxAscent/Descent` 取 `fontBoundingBox*` 的值（工单 18） |
| 6 | 真机上没有 `letterSpacing` | Pixi 会走自己的降级逻辑 | 字间距不保证效果，写进文档 |
| 7 | 上屏 canvas 没有 `addEventListener` | GlContextSystem 不加判断就调用 | 补空函数 |
| 8 | `navigator` 不存在 | Pixi 在模块加载时读取 `isMobile(navigator)` | 补 `{ userAgent: 'wechatgame', gpu: null }` |
| 9 | 禁止 `new Function` | — | 引入 `pixi.js/unsafe-eval`；产物里仍有 `new Function` 字面量，但运行时走不到，没有影响 |
| 10 | 动态 `import()` | — | 设置 `skipExtensionImports: true`；esbuild 的 iife 打包会把动态 import 内联掉 |

这些都必须在 Pixi 模块加载**之前**执行：放在第一个被 import 的模块里，esbuild 会保持 ESM 的执行顺序。

### 3. 渲染

- 直接 `new WebGLRenderer()` 并设置 `preferWebGLVersion: 1`，不走 `autoDetectRenderer`。
- 渲染分辨率为 `min(pixelRatio, 2)`。真机上上屏 canvas 被设成 804×1748，显示正常。
- 图片：`wx.createImage()` 加上显式的 `new ImageSource({ resource })` 可以正常使用。
- **iOS 没有 `OES_element_index_uint`**，Pixi 会警告“不支持 32 位索引”；Android 有这个扩展。批处理默认用 16 位索引，单个批次超过 65535 个索引（约 1 万个精灵）才会出问题，合成游戏用不到这个量级。引擎应该把这条警告降级为 debug 日志，并写进文档。

### 4. 物理（planck）

- 纯 JS，无需任何补丁。
- **确定性**：固定步长、固定 seed、相同屏幕宽度时，iOS 真机在第 120 步的位置和 Node 里的模拟逐个一致（例如 `(134,795) (71,749) …`）。这说明 Node 下的无头测试可以代表真机上的物理行为。
- 圆形堆叠稳定，静止后会正常休眠。

### 5. 输入

- `wx.onTouchStart` 的事件里有 `touches` 和 `changedTouches`。每个 Touch 带 `identifier`、`clientX/Y`、`pageX/Y`，单位是逻辑像素（窗口坐标），和 `getWindowInfo` 的宽高一致，可以直接映射到设计坐标。

### 6. 音频

- `wx.createWebAudioContext()` 可以用，`decodeAudioData` 支持回调写法，能解码 mp3。
- 真机上的初始 `state` 是 **`default`**，不是 `running`。在首次触摸时调用 `resume()` 之后才变成 `running`。
- `InnerAudioContext` 播放循环 BGM 没有问题。

### 7. 包体

- 引入 Pixi（完整入口）、planck 和 spike 代码，压缩后 `game.js` 是 **711 KB**。带内联 sourcemap 会超过 4 MB，导致真机预览上传失败，所以真机预览必须用 release 构建。
- 后续可以按需导入 Pixi 子模块来减小体积，目前不是瓶颈。

### 8. 性能：iOS 上很可能没有 JIT，物理是瓶颈

压测：从第 3 秒开始每 0.2 秒生成一个球，直到 150 个。单步物理耗时以 Node 为参照：

| 球数 | iPhone 普通模式（调试开） | iPhone 高性能模式（调试开） | iPhone 高性能模式（调试关） | Node 有 JIT | Node `--jitless` |
|---|---|---|---|---|---|
| 约 50–70 | 未计时 | 5.2–5.3 ms/步 | — | 0.29 | 5.1 |
| 约 130 | fps 断崖下跌 | 15.6 ms/步 | — | 0.95 | 21.3 |
| 150（还在碰撞） | 10–15 fps | 19.7 ms/步，10–15 fps | — | 1.12 | 25.5 |
| 150（已堆满静止） | 60 fps | 7–10 ms/步，60 fps | 12.6 ms/步，60 fps | 0.74 | 15.0 |

- 两种模式都开着调试时，曲线几乎一样。iPhone 的单步耗时接近 Node `--jitless`，比有 JIT 慢约 20 倍。
- 关掉调试、开高性能模式时，JIT 探针（Node 参照：有 JIT 约 1.6ms，无 JIT 约 22ms）是 9ms，单步物理 12.6ms，仍然接近无 JIT。**高性能模式在测试号或预览环境下可能没有生效，或者效果有限。这一点还没定论。**
- **渲染不是瓶颈**：每帧 0.2–0.5ms，2 次 drawcall。
- **帧率断崖的成因**是物理补帧雪崩：单步耗时超过一帧（约 16ms）后，累加器让下一帧补更多步（spike 里上限 5 步），帧率卡在约 11 fps，等碰撞平缓之后才恢复。
- 150 个球堆满后**不会进入休眠**（awake 一直是 150），所以不能指望休眠来省物理开销。

**对引擎的要求**（在没有 JIT 的前提下设计）：
1. 每帧最多补 2 个物理步，超出的时间直接丢弃，避免越补越慢。宁可游戏变慢，也不能卡成幻灯片。
2. 速度迭代和位置迭代次数可以配置（spike 用的是 8 和 3）。
3. 文档写明：没有 JIT 时，同时活跃的刚体约 60–80 个以内比较稳妥。合成大西瓜正常对局有 20–60 个水果，在这个范围内。
4. 无头测试里可以用 `node --jitless` 跑性能回归，来近似 iOS 真机。

## 开发流程上的收获

- 打开开发者工具的“服务端口”后，可以用 `cli open --project` 和 `cli preview --qr-format image` 全自动编译、生成预览二维码。
- 小游戏的控制台无法用命令行读取，所以采用**本地日志服务**：游戏用 `wx.request` 把日志 POST 到局域网 IP，工程配置里设 `urlCheck: false`，真机需要打开“开发调试”。在 `game.js` 最前面注入的启动日志和 `wx.onError` 能捕获模块加载阶段的崩溃，这点很关键。
- 这套流程值得做进 `sapling2d/vite` 和 `sapling2d/wechat`，作为微信端的调试能力。

## 对工单的影响

- **17（微信渲染与资源）**：实现上面表格里的第 1–4、7–10 项。
- **18（微信 Label）**：用 `fontBoundingBox*` 补齐 `actualBoundingBox*`。
- **16（微信构建与主循环）**：在运行时检测计时单位；release 构建要压缩、不带 sourcemap；考虑把日志服务和启动日志注入做成内置的调试能力。
- **08（物理基础）**：补帧上限为 2 步，多余时间丢弃；迭代次数可以配置；增加 `--jitless` 性能基准。
- **`iOSHighPerformance` 默认开启**：保留。但在拿到正式 AppID 后，要关掉调试重新验证它是否带来 JIT（工单 22）。
- **ADR 0001 的结论成立**：最小适配可行。
