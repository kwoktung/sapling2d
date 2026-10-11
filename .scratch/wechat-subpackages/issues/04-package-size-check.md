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

## Comments

**03 里发现（2026-10-11）：** `cli preview` 报的主包大小比我们的文件大：wechat-tree 发布构建 `game.js` 845 KB + logo 9 KB，CLI 报 main 1.7 MB。最可能是开发者工具按 `setting.es6: true` 把 ES6 转成 ES5，`game.js` 体积翻倍；上限按上传后的大小算，所以检查不能只看原始文件大小。先确认原因（试 `es6: false`，看真机能不能跑、CLI 报多大），再决定是改设置还是在检查里留余量。`cli preview --info-output <json>` 能拿到上传后的各包大小，可以拿来对照。
