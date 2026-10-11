# 04 — 发布构建检查包体大小

**What to build:** `saplingWechat` 在 `writeBundle` 里统计主包、分包和总包大小；发布构建超限时失败，接近时警告。开发构建只打印。

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] 主包 = `game.js` + `game.json` + `project.config.json` 之外上传的文件 + 主包资源；分包 = 分包目录；按上传时的口径（以 01 的结论为准）
- [ ] 上限写在插件里一处（主包 4 MB，分包 / 总包按 01）；发布构建超限时 `this.error`，信息里列出主包里最大的 5 个文件和它们的大小，提示挪出 `boot/`
- [ ] 超过上限的 80% 时警告
- [ ] 开发构建（内联 sourcemap）照旧只打印 `game.js` 大小和各包大小，不报错
- [ ] 测试：用临时目录构造文件，验证统计、警告和报错的阈值
- [ ] `pnpm check` 通过
