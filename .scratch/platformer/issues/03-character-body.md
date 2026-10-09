# 03 — CharacterBody2D：moveAndSlide 和格子碰撞

**What to build:** 平台游戏的角色可以写成 `CharacterBody2D` 的子类：在 `physicsProcess` 里自己算速度（重力、跑、跳），调用 `moveAndSlide()`，
角色被 TileMapLayer 的实心格挡住、能站在单向平台上，并且知道自己是否在地上、撞墙、顶头，以及碰到了哪些格子。设计见 ADR 0009。

- 接口：构造参数 `shape`（`rectangle(w, h)`，以节点位置为中心、轴对齐）、`velocity`、`moveAndSlide()`、`isOnFloor` / `isOnWall` / `isOnCeiling`、`slideCollisionCount` / `getSlideCollision(i)`（图层、格子坐标、法线；结果对象复用）、`collisionMask`。
- 算法：先 x 后 y 的格子扫掠，按从近到远检查扫过的所有格子，不拆子步；撞到的轴速度清零；单向平台只在向下移动、且移动前脚底不低于平台顶面时算实心；用很小的 ε 避免贴边移动被误挡。
- 不创建 planck 刚体，不占刚体预算。

**Blocked by:** 02 — TileMapLayer

**Status:** done（2026-10-09）

- [x] 无头测试逐帧断言：站在地上（`isOnFloor`，y 正好贴着地面）、撞墙（x 停在墙边、`velocity.x` 清零）、每帧移动超过一格也不穿地、单向平台从下穿过从上站住、顶砖块返回正确的格子坐标和法线、贴着墙走不被脚下的格子挡住
- [x] 多个图层时按 `collisionMask` 过滤；图层平移后碰撞仍然正确
- [x] 在 `physicsProcess` 以外调用 `moveAndSlide()` 时给出明确的错误或警告
- [x] 开发模式下角色和 `StaticBody2D` 重叠时打印一次警告（StaticBody2D 挡不住它）（引擎没有开发模式开关：每个角色最多提示一次，每 30 个物理步检查一次，只在物理世界已经存在时检查）
- [x] 每帧调用不分配内存（结果对象复用）（按代码检查，没有在真机上测）
- [x] `llms.txt` 加可运行示例（跑跳的角色），写明限制：只和 TileMap 碰撞、planck 物体挡不住也感知不到它、没有斜坡
- [x] `CONTEXT.md` 加 CharacterBody2D 词条，说明和 RigidBody2D / HitTester 的区别

## Comments

**实现（2026-10-09）：**

- `CharacterBody2D`（`Node2D`）：`shape`、`velocity`，以及不分配内存的 `velocityX` / `velocityY` / `setVelocity(x, y)`；`moveAndSlide()`、`isOnFloor` / `isOnWall` / `isOnCeiling`、`slideCollisionCount` / `getSlideCollision(i)`、`collisionMask`。
- 扫掠：只检查“这一步新进入的”列 / 行（已经和角色重叠的格子不算，卡在墙里也能走出来），多个图层取最近的阻挡；每轴最多一个碰撞结果。
  因为只看新进入的行，向下扫到的单向平台顶面一定不高于移动前的脚底，所以“脚底在平台以上”的条件自然满足。
- 坐标：角色父节点和图层各自按祖先累加平移，遇到旋转或缩放直接报错。
- StaticBody2D 提示：`PhysicsWorld._firstStaticOverlapping` 用 planck 的 `queryAABB` 比较包围盒。
- **额外改动（输入）**：`physicsProcess` 里的 `isActionJustPressed` / `isActionJustReleased` 改为按物理步算（和 Godot 一样）。
  原来按帧算：120Hz 屏幕上有一半的帧没有物理步，在这些帧按下的跳跃在 `physicsProcess` 里永远看不到。`process` 里的行为不变。

**代码审查（2026-10-09）：** 修了：扫掠只走地图范围内的格子（速度很大或 Infinity 时不会卡住）；整个物理步（包括刚体的接触信号）里 `isActionJustPressed` 都按物理步算；
`removeAction` 一并清掉 just 状态；图层的全局平移每次 `moveAndSlide` 只算一次；没有碰撞图块的图层（纯装饰）跳过；法线用 `Vector2.LEFT` 等常量；
文档改正：角色自己的 rotation / scale 不影响碰撞盒（不报错），只有祖先和图层会报错；StaticBody2D 提示的查询复用 AABB 和回调。
没改：`_inPhysicsProcess` 和 `input._inPhysics` 两个标志——修完之后范围不同（前者只在 physicsProcess 里，后者覆盖整个物理步）。
