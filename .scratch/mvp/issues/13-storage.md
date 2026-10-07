# 13 — Storage

**What to build:** 持久化少量数据，比如最高分。

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] 同步 API `Storage.get<T>(key, default)`、`Storage.set(key, value)` 和 `Storage.remove(key)`，值做 JSON 序列化，key 统一加前缀
- [ ] 浏览器端用 localStorage，所有访问都 try/catch，失败时退回内存实现
- [ ] 无头模式用内存实现，测试之间相互隔离
