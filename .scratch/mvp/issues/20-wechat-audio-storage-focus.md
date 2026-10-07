# 20 — 微信音频、存储、前后台

**What to build:** 音频、存储和前后台切换在小游戏里正常工作。

**Blocked by:** 19, 11, 12, 13

**Status:** done（2026-10-07）。iOS 真机：音效、BGM、静音、切后台恢复、最高分保存由用户确认正常；Android 真机验证通过。

- [x] 音效用 `wx.createWebAudioContext` 解码 buffer 后播放；音乐用 `InnerAudioContext` 流式播放，用完记得 destroy
- [x] 总线音量和首次触摸解锁的行为与浏览器一致
- [x] Storage 底层改用 `wx.getStorageSync` 和 `wx.setStorageSync`
- [x] `wx.onHide` 和 `wx.onShow` 触发 `focusChanged`，默认行为与浏览器一致
- [x] 在开发者工具里验证：音效能同时播放多个、BGM 能循环、最高分重启后还在、切后台再回来物理不会跳变
