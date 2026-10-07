# 12 — 浏览器音频

**What to build:** 游戏里能播放音效和背景音乐，并分别控制音量。

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] `AudioStreamPlayer` 节点支持 stream、`play`、`stop`、`volume`、`loop` 和 `bus`，并提供 `finished` 信号
- [ ] `Audio.play(stream, opts)` 用于一次性音效，是语法糖
- [ ] 三条总线 Master、Music 和 SFX，各自可以调音量、静音
- [ ] 音效用 WebAudio 的预解码 buffer，可以多个同时播放；音乐流式播放
- [ ] 在 `static assets` 里可以声明 `sfx(...)` 和 `music(...)`
- [ ] 首次触摸或点击时自动解锁音频，用户不需要额外处理
- [ ] 收到 `focusChanged` 时挂起和恢复音频（与 11 对接）
- [ ] 无头模式下用空实现，但能记录播放调用，供测试断言
