# 01 — 塔防灰盒原型：可玩的一局

**What to build:** 按 spec 在 `examples/towerdefense` 做出可玩的一局：随机曲线下行的怪物、放英雄、三种攻击（弹道 / 范围 / 近战）、波次之间三选一升级、命用完失败。
遇到引擎不足先在游戏里绕过去，把绕法和成本记下来，最后填 spec 的验证清单。

**Blocked by:** None — can start immediately

**Status:** done（2026-10-10）

- [x] `examples/towerdefense` 从 `templates/game` 起步，`pnpm --filter example-towerdefense dev` 能启动；占位图由脚本生成
- [x] 怪物沿随机 Catmull-Rom 曲线匀速下行（按弧长），走到底线扣命；每波数量和血量递增
- [x] 英雄栏 + 槽位：点英雄再点空槽位放下，扣金币；钱不够时不能放
- [x] 三种英雄，攻击序列帧带 `durations`，伤害在出手帧结算；攻速升级时用 `speedScale` 加速动画
- [x] 波次结束弹出三选一升级卡片，选择后下一波开始；升级对同类英雄全体生效
- [x] 命中反馈：闪白（剪影子精灵）、击退、飘字（Label 池）、火花和碎片粒子、漏怪震屏
- [x] 无头测试：路径（起点在上、终点在底线、匀速）、放英雄扣钱、出手帧才扣血、范围伤害、波次结束出现三张卡、选卡后数值变化、命用完失败
- [x] 浏览器验证一局；记录同屏 60 个怪时的逻辑耗时（`frameStats`）
- [x] 填 spec 的验证清单：每个缺口给出结论（需要进引擎 / 游戏里绕就够 / 不需要）

## Comments

**实现（2026-10-10）：**

- `examples/towerdefense`（约 1100 行，见它的 `AGENTS.md`）。三种英雄共用一套攻击节奏（`ATTACK.durations = [0.08, 0.16, 0.06, 0.14]`，出手帧 2），占位图是 6 帧横条（下蹲 → 蓄力 → 拉长出手 → 收招）。
- 14 个无头测试（`path.test.ts` 2 个、`battle.test.ts` 12 个，其中一个是打印耗时的压力测试）。
- 浏览器验证（Chrome，400×712@2x）：放英雄、三种攻击、飘字、闪白、波次结束的三张卡、选卡进入下一波、失败和重来都正常，控制台没有错误和警告。压力测试数据见 spec。
- 验证清单的结论写在 spec 里。

**过程中踩的坑（都已在游戏里解决，写进了 AGENTS.md）：**

- uniform Catmull-Rom 在随机路径上出尖角（约 5%），换成 centripetal。这是 Curve2D 值得进引擎的主要理由。
- `ColorRect` 当按钮忘了 `inputPickable`：画出来了但点不到，没有任何提示。遮罩也一样，三选一时点击会穿过去落到槽位上。之前的测试碰巧通过，就是因为遮罩没挡住。值得在 llms.txt 里写明。
- 测试里 `stopSpawning()` 之后场上是空的，会被当成“这一波打完了”而弹出升级。改成 `stopSpawning()` 同时关掉自动结束。

**下一步建议：** additive 混合（P0）→ 受击闪白（P1）→ Curve2D（P1），各开一个引擎工单；llms.txt 已补 `ColorRect` 按钮的说明；真机数据（02）回来后决定 BitmapText。
