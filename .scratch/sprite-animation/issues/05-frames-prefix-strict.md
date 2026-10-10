# 05 — `atlas().frames(prefix)` 只匹配“前缀 + 编号”

**What to build:** 现在 `frames('hero_attack_')` 取所有以这个前缀开头的帧，`hero_attack_heavy_01.png` 也会被算进来，攻击动画里混进另一套动作，而且不报错（03 写文档时发现）。
改成只匹配“前缀 + 数字 + 可选扩展名”（`hero_attack_01`、`hero_attack_2.png`），前缀后面跟的不是编号的帧不算。

**Blocked by:** None — can start immediately

**Status:** done（2026-10-10）

需要决定：

- 这是行为变化：有人可能依赖 `frames('explosion')` 取到 `explosion_1` 这类名字（前缀后面先跟分隔符再跟数字）。规则可以定成“剩下的部分是可选的分隔符 `_` / `-` / 空格 + 数字 + 可选扩展名”。
- 一个也匹配不上、但有“宽松前缀”能匹配上的帧时，报错信息列出这些名字，提示改用更长的前缀。
- 要不要保留宽松匹配的入口（例如 `framesStartingWith(prefix)`），还是直接用 `names.filter` 自己取。

## Comments

**决定和实现（2026-10-10）：** 用户决定改成只匹配“前缀 + 编号”。

- 规则：前缀后面剩下的部分必须是 `[_\- ]?\d+(\.扩展名)?`。分隔符可以写在前缀里，也可以不写：`frames('explosion_')` 和 `frames('explosion')` 都取 `explosion_1`。
- 排序改成按提取出的编号排，编号相同再按名字（之前的自然排序在分隔符不统一时会排错：`boom3` 排到 `boom-1` 前面）。
- 一帧都没取到、但有“前缀开头、后面不是编号”的帧时，报错列出最多 5 个，并给出更长的前缀建议（`frames('boomer')` → 提示 `"boomerang_"`）。
- 不保留宽松匹配的入口：需要时 `names.filter(...)` 再 `get()` 就行。
- 仓库里的游戏都用网格图集的 `frames()`（不带前缀），不受影响。已发布的 0.1.1 里依赖宽松匹配的写法（例如前缀后面是字母）会取不到帧并报错，提交标了 BREAKING CHANGE。
