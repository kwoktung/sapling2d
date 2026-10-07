# 07 — Label 文字

**What to build:** 在游戏里显示和更新文字，比如分数。

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] `Label` 支持 text、字号、颜色、对齐方式和描边，底层用 Pixi 的 canvas Text
- [ ] 改了 text 之后，下一帧画面就会更新
- [ ] 无头模式下不渲染，但 `dump` 里能看到 text
- [ ] 浏览器示例里有一个每秒自增的计数 Label
