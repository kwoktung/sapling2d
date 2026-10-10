# 14 — 音频

**What to build:** 从 CC0 音效包挑音效、找一首免费可商用的循环背景音乐，接进游戏。

**Blocked by:** 10

**Status:** done (2026-10-10), waiting for the user to listen

- [x] 音效：射箭、箭命中、火球爆炸、冰冻、闪电、斩击、击退、怪物死亡、漏怪、升级、选卡、按钮、大招（三种）、Boss 出场、胜利、失败；统一转成 mp3
- [x] 背景音乐一首循环；设置里能关音乐 / 音效（`setBusMute`）
- [x] 同一帧大量命中时限制同一音效的并发数（不要几十个同时播）
- [x] `public/assets/audio/CREDITS.md` 记下每个文件的来源和授权
- [x] 无头测试：关键事件触发对应音效（`g.audio.log`）、并发限制

## Comments

**实现（2026-10-10）：**

- 引擎：`tree.audio.play(stream, { maxVoices })`，同一个声音已经有这么多个在播时这次不播（返回已停止的 Voice），对应 Godot 的 max_polyphony；测试和 llms.txt 都补了。
- 音效 20 个：Kenney（Impact / Interface / Sci-fi / RPG Audio / Music Jingles）和 rubberduck 的 OpenGameArt 合集，全部 CC0。没有现成的射箭声，射箭用的是刀划过的破空声；箭雨是把它错开叠三次。胜利 / 失败是 Kenney 的拨弦短乐句。
- 背景音乐：RandomMind 的 Medieval: Minstrel Dance（CC0，56 秒循环版）。候选还有同一作者的 Market Day、Wolfgang_ 的 8-bit Battle Loop。
- 统一转成单声道 64 kbps mp3，去掉开头的静音、统一响度；音频共约 570 KB，加上图片一共 1.4 MB。
- 并发上限：命中 4、死亡 4、爆炸 / 冰冻 3、射箭 3，其余 1–2（`src/sounds.ts`）。
- 设置：HUD 右上角“音乐 / 音效”开关，静音对应总线并存档。
- 选的时候没有试听（按文件名和时长挑的），需要用户听一遍，不合适的换掉。
