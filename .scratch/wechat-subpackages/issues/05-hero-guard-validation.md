# 05 — hero-guard 上真机验证

**What to build:** 在 `~/Projects/hero-guard`（链接本地引擎）用上启动页和分包，发布构建后在真机上跑通。

**Blocked by:** 03、04

**Status:** ready-for-human（需要真机）

- [ ] 加一个启动页（logo + 进度条），图片放 `public/assets/boot/`
- [ ] `SAPLING_RELEASE=1` 构建通过，打印的主包大小明显低于 4 MB
- [ ] 真机首次启动：启动页立刻出现，进度条走完后进入游戏；第二次启动（有缓存）进度条只是一闪
- [ ] 用一张未压缩的大图确认：资源超过原来的 2.5 MB 预算后照样能构建和运行；更新 art pipeline 文档里的包体预算
- [ ] 遇到的问题回写到本 spec 的 Comments 或新工单
