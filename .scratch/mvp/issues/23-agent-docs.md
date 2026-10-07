# 23 — 面向 agent 的文档

**What to build:** 让 agent 只读文档，就能用 sapling2d 正确写出游戏和测试。

**Blocked by:** 21

**Status:** ready-for-agent

- [ ] `llms.txt`：概念、节点清单和每个节点的最小示例、常见陷阱（Vector2 不可变、queueFree 延迟执行、物理回调中的增删、不支持路径查找）
- [ ] 游戏项目模板附带 `AGENTS.md`：开发流程、无头测试的写法、`dump` 的用法、微信调试流程
- [ ] 文档里的示例全部可以运行，并且被测试覆盖
- [ ] 验证：用一个全新的 agent 会话只读这些文档，实现一个小改动（比如加一种水果），能一次通过测试
