# 10 — Timer、Tween

**What to build:** 计时和补间动画，用来做合成时的弹跳、延迟生成这类效果。

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] `Timer` 节点支持 `waitTime`、`oneShot`、`autostart`、`start` 和 `stop`；`timeout` 是 Signal
- [ ] `this.createTween()` 绑定到当前节点，支持 `to(target, props, duration, ease)`、`parallel()` 和 `call(fn)`
- [ ] Tween 的属性有类型约束，只允许数值或 Vector2 类型的字段
- [ ] 提供常用的 Ease 曲线，至少有 Linear、QuadIn/Out/InOut、BackOut 和 ElasticOut
- [ ] 节点销毁时 Tween 自动停止；`finished` 可以 await
- [ ] 无头模式下 Timer 和 Tween 由 step 驱动，结果是确定的，有测试覆盖
