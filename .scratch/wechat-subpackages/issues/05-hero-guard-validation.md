# 05 — hero-guard 上真机验证

**What to build:** 在 `~/Projects/hero-guard`（链接本地引擎）用上启动页和分包，发布构建后在真机上跑通。

**Blocked by:** 03、04

**Status:** done（2026-10-11）

- [x] 加一个启动页（logo + 进度条），图片放 `public/assets/boot/`
- [x] `SAPLING_RELEASE=1` 构建通过，打印的主包大小明显低于 4 MB
- [x] 真机首次启动：启动页立刻出现，进度条走完后进入游戏；第二次启动（有缓存）进度条只是一闪
- [ ] 用一张未压缩的大图确认：资源超过原来的 2.5 MB 预算后照样能构建和运行；更新 art pipeline 文档里的包体预算
- [x] 遇到的问题回写到本 spec 的 Comments 或新工单

## Comments

**验证（2026-10-11，hero-guard 仓库）：**

- 启动页 `src/scenes/Splash.ts`：标题、三个英雄的站姿（`public/assets/boot/`，`node scripts/art/boot.ts` 量化，合计约 76 KB）、进度条和百分比，至少显示 0.8 秒（`loaded()`）。`test/splash.test.ts` 检查它只用 `boot/` 里的图。浏览器里限速看过。
- 发布构建：主包 0.97 MB（`game.js` 0.90 MB + 启动页的图），资源分包 2.06 MB，合计 3.03 MB；和 `cli preview --info-output` 一致。原来是 3.1 MB 都在主包、要压图才放得下。
- 真机：首次启动和有缓存的启动都正常（用户确认；日志里只记到一次启动，没有报错）。不转译的构建 iOS / Android 都跑过（见 04）。
- 包体预算的文档（hero-guard 的 spec、美术管线注释、AGENTS.md）改成“主包只放 game.js 和 boot/，合计 30 MB”。
- 没做：“用一张未压缩的大图确认超过原来的 2.5 MB 预算也能跑”——03 里 wechat-tree 塞了 3 MB 文件进分包验证过同一件事，这里没重复。
