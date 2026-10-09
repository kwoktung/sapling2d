# 08 — 真机性能和试玩

**What to build:** 竖屏小游戏发布构建，在 iPhone 上验证性能目标，并请用户试玩手感。

**Blocked by:** 07

**Status:** ready-for-human

- [ ] 同屏约 150 把刀、20 个敌人：iPhone 发布构建稳定 60 fps，用 `game.frameStats` 记录逻辑和渲染的平均 / 最大值（表格格式同 platformer 的 08）
- [ ] 约 500 把刀：只记录数据。如果逻辑耗时超标，判断瓶颈在 `KnifeCollider` 还是推挤，再决定要不要做空间分桶（游戏内）或新开引擎工单
- [ ] 打击停顿、粒子、摇杆在真机上的手感由用户试玩确认
- [ ] 模拟器和真机表现不一致的地方记进 Comments（参考 `spikes/wechat/REPORT.md`）
