# 14 — 场景切换

**What to build:** 在场景之间切换，比如从游戏场景切到结束场景再切回来，并且可以传有类型的参数。

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] `tree.changeScene(SceneClass, params)`：参数类型由目标场景声明，传错会编译报错
- [ ] 切换时，旧场景的节点按 `exitTree` 和释放流程销毁；新场景的 `static assets` 加载完之后才执行它的 `ready`
- [ ] 不再被任何场景引用的资源会卸载
- [ ] Autoload 在切换场景后仍然保留
- [ ] 有无头测试：切换前后的 `dump` 正确，Autoload 的状态被保留
