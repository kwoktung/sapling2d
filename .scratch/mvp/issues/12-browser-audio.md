# 12 — 浏览器音频

**What to build:** 游戏里能播放音效和背景音乐，并分别控制音量。

**Blocked by:** 04

**Status:** done（2026-10-07）。`Audio.play` 实现为 `this.tree.audio.play`；音量用 0–1 线性值；MVP 中 `tree.paused` 不暂停音频。

- [x] `AudioStreamPlayer` 节点支持 stream、`play`、`stop`、`volume`、`loop` 和 `bus`，并提供 `finished` 信号
- [x] `Audio.play(stream, opts)` 用于一次性音效，是语法糖
- [x] 三条总线 Master、Music 和 SFX，各自可以调音量、静音
- [x] 音效用 WebAudio 的预解码 buffer，可以多个同时播放；音乐流式播放
- [x] 在 `static assets` 里可以声明 `sfx(...)` 和 `music(...)`
- [x] 首次触摸或点击时自动解锁音频，用户不需要额外处理
- [x] 收到 `focusChanged` 时挂起和恢复音频（与 11 对接）
- [x] 无头模式下用空实现，但能记录播放调用，供测试断言
