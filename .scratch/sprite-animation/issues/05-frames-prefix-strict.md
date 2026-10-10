# 05 — `atlas().frames(prefix)` 只匹配“前缀 + 编号”

**What to build:** 现在 `frames('hero_attack_')` 取所有以这个前缀开头的帧，`hero_attack_heavy_01.png` 也会被算进来，攻击动画里混进另一套动作，而且不报错（03 写文档时发现）。
改成只匹配“前缀 + 数字 + 可选扩展名”（`hero_attack_01`、`hero_attack_2.png`），前缀后面跟的不是编号的帧不算。

**Blocked by:** None — can start immediately

**Status:** needs-triage

需要决定：

- 这是行为变化：有人可能依赖 `frames('explosion')` 取到 `explosion_1` 这类名字（前缀后面先跟分隔符再跟数字）。规则可以定成“剩下的部分是可选的分隔符 `_` / `-` / 空格 + 数字 + 可选扩展名”。
- 一个也匹配不上、但有“宽松前缀”能匹配上的帧时，报错信息列出这些名字，提示改用更长的前缀。
- 要不要保留宽松匹配的入口（例如 `framesStartingWith(prefix)`），还是直接用 `names.filter` 自己取。

## Comments
