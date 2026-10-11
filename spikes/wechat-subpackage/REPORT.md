# 分包实验报告（.scratch/wechat-subpackages/issues/01）

日期：2026-10-11
环境：iPhone 17，iOS 26.6.1，微信 8.0.79，基础库 3.17.4；开发者工具 CLI 预览。Android 和模拟器还没测。

运行：`WX_APPID=… LOG_HOST=<局域网 IP> node build.mjs`，`node log-server.ts`（端口 7778），用开发者工具或 `cli preview` 打开 `dist/`。`DELAY=8` 时启动后倒计时 8 秒再加载分包（测断网），`NO_ENTRY=1` 不生成分包的 `game.js`。

## 结论

| 问题 | 结论 |
|---|---|
| 分包目录里要不要 `game.js` | **必须有**：没有时开发者工具编译失败（`game.json: ["subpackages"][0]["root"] could not find the corresponding file: "/pkg/game.js"`）。分包加载完时它会执行，空文件就行 |
| `game.json` | `subpackages: [{ name: 'pkg', root: 'pkg/' }]` |
| 加载后的路径 | `pkg/img.png` 和 `/pkg/img.png` 都能读；`createImage`、`readFile`（utf8 / 二进制）、`InnerAudioContext.src`、WebAudio `decodeAudioData`、`accessSync`、`statSync` 都正常。路径写法和主包一样 |
| 加载前读分包文件 | 首次安装：图片 `onerror`（事件里没有错误信息），`readFile` 返回 `errno 1300002 "file info not exit"`。**但装了新版本后，加载前能读到上一个版本的分包文件**——不能靠“读不到”判断分包是否已加载，读分包资源前一律先等 `loadSubpackage` |
| 下载期间 | 3 MB 用 1.7 秒，期间 103–105 帧，最长帧间隔 18–24 ms：帧循环和绘制不受影响 |
| `onProgressUpdate` | 约 190 次。字段 `totalBytesWritten`、`totalBytesExpectedToWrite`、`progress`。**`progress` 在 iOS 上是 0..1（文档说 0..100）**；**最后一个事件是坏数据**：`totalBytesExpectedToWrite: 4294967295`、`totalBytesWritten: 0`、`progress: -3160179`。进度要自己用字节数算，钳到 0..1、只增不减，忽略期望字节数不合理的事件 |
| 缓存 | 同一版本再次启动：7 ms 完成，没有进度事件。同一次运行里再调用：立即成功、没有进度事件。发布新版本后会重新下载（不用删小游戏）；本地存储跨版本保留 |
| 下载失败 | **没测到**（这次测试时没有断网）。实现上按“重试 2 次，仍失败就报清楚的错误”处理 |
| 上限 | 官方文档：主包 4 MB，单个分包不限，所有包合计 30 MB（[代码包](https://developers.weixin.qq.com/minigame/en/dev/guide/framework/code-package.html)、[分包](https://developers.weixin.qq.com/minigame/en/dev/guide/base-ability/subPackage/useSubPackage.html)） |
| 包体大小 | `cli preview --info-output <json>` 给出主包和每个分包的大小（这次主包 26 KB、`/pkg/` 3.0 MB），可以和构建时自己统计的对照 |

## 包体大小的口径（04，2026-10-11）

- `cli preview --info-output` 报的大小：关掉开发者工具的转译（`setting.es6: false, enhance: false`）时和文件大小一致（hero-guard 主包 939,872 对 `game.js` 939,138 字节）。打开任一项时 `game.js` 被转成 ES5，上传后变大且无法预估：wechat-tree 1.14 倍，hero-guard 2.1 倍。`minified`、`uploadWithSourceMap` 不影响。
- **开发者工具按项目路径缓存设置**：在已经打开过的目录里改 `project.config.json`、甚至 `cli close` 之后，CLI 报的大小有时还是旧的。要量准，就把产物拷到一个新目录再 `cli preview`。
- 不转译的 ES2017 构建在 iPhone 17 上正常：hero-guard 第 1–2 波 60 fps，逻辑 0.6–0.8 ms、渲染约 3 ms，没有报错。Android 没测。
