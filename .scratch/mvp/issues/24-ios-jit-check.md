# 24 — iOS 高性能模式 JIT 验证

**What to build:** 确认 `iOSHighPerformance: true` 在真机上是否真的带来 JIT，从而决定是否保留这个默认值、以及无 JIT 时的性能预算是否需要调整。

**Blocked by:** None — 需要正式小游戏 AppID

**Status:** ready-for-human（2026-10-07 记为待办；从 22 拆出）

- [ ] 用正式 AppID 构建 release 包，关闭“开发调试”（关闭后日志发不回电脑，结果显示在画面上）
- [ ] 在 iOS 真机上分别用普通模式和高性能模式运行 JIT 探针和物理压测（150 个刚体），记录探针耗时、单步物理耗时和帧率
- [ ] 结论写回 spikes/wechat/REPORT.md 第 8 节和 ADR 0005；若高性能模式无效，评估是否改默认值

背景：spike 01 中，开着调试时两种模式表现一样，单步物理耗时接近 Node `--jitless`；关闭调试的高性能模式 JIT 探针为 9ms，介于有 JIT（约 1.6ms）和无 JIT（约 22ms）之间，没有定论。合成大西瓜正常对局（20–60 个水果）不受影响。
