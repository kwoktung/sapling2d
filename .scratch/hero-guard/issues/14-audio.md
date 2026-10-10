# 14 — 音频

**What to build:** 从 CC0 音效包挑音效、找一首免费可商用的循环背景音乐，接进游戏。

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] 音效：射箭、箭命中、火球爆炸、冰冻、闪电、斩击、击退、怪物死亡、漏怪、升级、选卡、按钮、大招（三种）、Boss 出场、胜利、失败；统一转成 mp3
- [ ] 背景音乐一首循环；设置里能关音乐 / 音效（`setBusMute`）
- [ ] 同一帧大量命中时限制同一音效的并发数（不要几十个同时播）
- [ ] `public/assets/audio/CREDITS.md` 记下每个文件的来源和授权
- [ ] 无头测试：关键事件触发对应音效（`g.audio.log`）、并发限制

## Comments
