# 09 — 碰撞信号、Area2D、碰撞层

**What to build:** 游戏逻辑能够响应碰撞，并且可以在碰撞回调里安全地增删节点。这是合成玩法的核心。

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] 物理刚体提供 `bodyEntered` 和 `bodyExited` 信号，参数是对方节点
- [ ] `Area2D` 是传感器，提供 `bodyEntered` 和 `bodyExited`，不参与碰撞解算
- [ ] 支持 `collisionLayer` 和 `collisionMask`；验证 planck 的过滤位能否用 32 位，不行就退回 16 层，并把结论写进文档
- [ ] 物理 step 期间调用 `queueFree`、`add` 或新建刚体时，统一延迟到这一步结束之后执行，不会崩溃
- [ ] `CollisionShape2D` 支持多边形
- [ ] 有无头测试：两个刚体碰撞后各自被移除，再生成一个新刚体，状态正确
