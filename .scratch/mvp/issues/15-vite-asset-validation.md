# 15 — sapling2d/vite：资源路径校验

**What to build:** 资源路径写错时，构建或开发服务器会立刻报错，而不是等到运行时才失败。

**Blocked by:** 04

**Status:** done（2026-10-07）

- [x] 发布 `sapling2d/vite` 插件
- [x] 扫描 `static assets` 里 `tex`、`sfx`、`music` 的字面量路径，文件不存在时，构建失败、开发服务器给出明确报错（带文件名和位置）
- [x] 资源目录的约定写进文档，引擎内部路径与平台无关
