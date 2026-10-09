# 03 — CharacterBody2D：moveAndSlide 和格子碰撞

**What to build:** 平台游戏的角色可以写成 `CharacterBody2D` 的子类：在 `physicsProcess` 里自己算速度（重力、跑、跳），调用 `moveAndSlide()`，
角色被 TileMapLayer 的实心格挡住、能站在单向平台上，并且知道自己是否在地上、撞墙、顶头，以及碰到了哪些格子。设计见 ADR 0009。

- 接口：构造参数 `shape`（`rectangle(w, h)`，以节点位置为中心、轴对齐）、`velocity`、`moveAndSlide()`、`isOnFloor` / `isOnWall` / `isOnCeiling`、`slideCollisionCount` / `getSlideCollision(i)`（图层、格子坐标、法线；结果对象复用）、`collisionMask`。
- 算法：先 x 后 y 的格子扫掠，按从近到远检查扫过的所有格子，不拆子步；撞到的轴速度清零；单向平台只在向下移动、且移动前脚底不低于平台顶面时算实心；用很小的 ε 避免贴边移动被误挡。
- 不创建 planck 刚体，不占刚体预算。

**Blocked by:** 02 — TileMapLayer

**Status:** ready-for-agent

- [ ] 无头测试逐帧断言：站在地上（`isOnFloor`，y 正好贴着地面）、撞墙（x 停在墙边、`velocity.x` 清零）、每帧移动超过一格也不穿地、单向平台从下穿过从上站住、顶砖块返回正确的格子坐标和法线、贴着墙走不被脚下的格子挡住
- [ ] 多个图层时按 `collisionMask` 过滤；图层平移后碰撞仍然正确
- [ ] 在 `physicsProcess` 以外调用 `moveAndSlide()` 时给出明确的错误或警告
- [ ] 开发模式下角色和 `StaticBody2D` 重叠时打印一次警告（StaticBody2D 挡不住它）
- [ ] 每帧调用不分配内存（结果对象复用）
- [ ] `llms.txt` 加可运行示例（跑跳的角色），写明限制：只和 TileMap 碰撞、planck 物体挡不住也感知不到它、没有斜坡
- [ ] `CONTEXT.md` 加 CharacterBody2D 词条，说明和 RigidBody2D / HitTester 的区别
