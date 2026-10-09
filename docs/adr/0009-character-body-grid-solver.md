# 0009 — CharacterBody2D 直接和 TileMap 的格子做碰撞，不经过 planck

**Status:** Accepted (2026-10-09)

## Context

横版平台游戏的角色（马里奥）由代码控制移动：每帧给定速度，要被地面和墙挡住，要知道自己是否站在地上、是否撞到墙、顶到了哪块砖。
手感要求精确、可预期：不能弹、不能滑、不能卡在相邻两格的接缝上。

ADR 0005 规定物理只用 planck，并预计角色控制器“基于 kinematic 刚体加 rayCast 自行实现”。展开来看，这条路有几个问题：

- 在 Box2D / planck 里，只有 dynamic 刚体会被求解器推开；static 和 kinematic 之间、kinematic 和 kinematic 之间根本不产生接触。
  kinematic 角色不会被任何东西挡住，“挡住”只能靠自己查询世界后修正位置。
- Godot 的 `CharacterBody2D.move_and_slide()` 正是这么做的：对整个物理世界做形状扫掠查询（motion test），带 `safe_margin`、多次滑动、贴地吸附，
  TileMap 为此自动生成物理体。这是一大套代码，planck 1.5 只提供零散的 `queryAABB`、`rayCast`、`ShapeCast`、`TimeOfImpact` 原语。
- 用 dynamic 刚体当角色（锁定旋转、零摩擦）手感难调：会被斜面和接缝弹起，速度被求解器改写，落地判定要靠接触回调猜。
- 关卡几万格，生成成 planck 静态形状数量很大；相邻格子的接缝会卡住角色（Box2D 的经典“幽灵碰撞”）。
- iOS 小游戏没有 JIT，刚体预算只有 60–80 个（`spikes/wechat/REPORT.md`）。

而平台游戏的地形就是格子（ADR 0008）。角色是一个轴对齐矩形，判断“这一步扫过的格子里有没有实心格”只需要整数运算。

## Decision

`CharacterBody2D` 是一个 `Node2D`，自己和 TileMap 的格子做碰撞，不创建 planck 刚体。和 ADR 0007 的 `HitTester` 一样，它是 planck 旁边一个只做特定事情的工具，不是第二个物理引擎。

### 接口（名字照搬 Godot）

- 构造参数 `shape`：`rectangle(w, h)`，以节点位置为中心，轴对齐，不随 rotation / scale 变化。
- `velocity`（像素/秒）、`moveAndSlide()`：只能在 `physicsProcess` 里调用（固定 60Hz，结果确定）。撞到的那个轴的速度清零。
- 结果：`isOnFloor` / `isOnWall` / `isOnCeiling`；`slideCollisionCount` 和 `getSlideCollision(i)`（哪个图层、格子坐标、法线），结果对象复用，每帧不分配。
- `collisionMask`：和哪些 TileMap 图层碰撞。
- 重力、加速度、跳跃都由游戏自己写，引擎只负责“移动、被挡住、报告碰到了什么”。“上”固定为 -y。

### 算法：轴分离的格子扫掠

1. 先移动 x：计算这一步前沿扫过的列，按从近到远的顺序检查和角色高度重叠的行；遇到第一个实心格就贴着它停下、`velocity.x = 0`、记为撞墙。
2. 再用新的 x 移动 y：同样处理，向下撞到是落地，向上撞到是顶头，记下撞到的格子。
3. 单向平台只在 y 轴向下移动、并且移动前脚底不低于平台顶面时才算实心。
4. 比较时留一个很小的 ε，贴着格子边缘移动不会被相邻行或列误判为挡住。

检查的是整段移动扫过的所有格子，速度再快也不会穿墙，不需要拆分子步。

### TileMap 这边

`TileMapLayer` 进入场景树时登记、离开时注销；`moveAndSlide()` 遍历登记的图层，跳过 `collisionMask` 不匹配的。
它只依赖一个内部接口（格子边长 + 某一格的碰撞类型：空 / 实心 / 单向），不依赖 TileMapLayer 类，以后可以加“可移动的实心矩形”（移动平台）。
角色位置先换算到图层的局部坐标再查格子，所以图层可以平移，但不能旋转、缩放。

### 第一版不做

斜坡和任意形状、被 planck 物体（`StaticBody2D` 等）挡住、角色之间互相阻挡、移动平台、顶角修正（头擦到砖块边缘时向旁边推开）。
角色和敌人、金币之间用 `HitTester` 判断（矩形 × 矩形），踩敌人由游戏判断（下落中、上一帧脚底高于敌人中心）。

## Consequences

- 碰撞完全确定、可预期，不弹、不卡接缝；每个角色每帧只查扫过的几格，开销可以忽略，不占刚体预算。
- 可以写无头测试逐帧断言：站在地上、撞墙、高速下落不穿地、单向平台、顶砖块的格子坐标和法线、贴墙走不被脚下的格子挡住。
- **`StaticBody2D` 挡不住 `CharacterBody2D`**，planck 世界也感知不到它（`Area2D` 检测不到它，`RigidBody2D` 不会被它推开）。
  墙和地面都要画进 TileMap。开发模式下，角色和 `StaticBody2D` 重叠时打印警告，`llms.txt` 写明这个限制。
- TileMap 的碰撞只能是整格，做不了斜坡（ADR 0008）。
- 需要时再加，接口不变：
  - 可选的 planck“影子”（`physicsProxy: true`）：一个跟随角色的 kinematic 刚体，让 `Area2D` 和 `RigidBody2D` 能感知角色。
    这是单向的，影子不会挡住角色；`Area2D` 需要放宽“只检测 dynamic”的限制；推箱子会很生硬（kinematic 质量无限大）。
  - 用 planck 的 `queryAABB` 查询静态矩形，让 `StaticBody2D` 也能挡住角色。
  - 移动平台：在同一个格子求解器里加可移动的实心矩形。
- ADR 0005 里“角色控制器基于 kinematic 刚体加 rayCast”的预计不再成立；`AnimatableBody2D` 的位置仍然保留。

## Alternatives

- **kinematic 刚体 + planck 查询（照搬 Godot 的 `move_and_slide`）**：能被所有 planck 物体挡住，规则统一；
  但要在 planck 零散的查询原语上自己实现扫掠、`safe_margin`、多次滑动和贴地，代码量大、iOS 上每帧查询开销高，
  而且 TileMap 仍然要生成大量静态形状，接缝问题还在。等真的需要和 planck 物体互相阻挡时，再以“查询静态矩形”的方式补上。
- **dynamic 刚体当角色**：手感难控制（弹跳、接缝、速度被改写），落地判定不可靠。
- **TileMap 生成 planck 静态物体，角色走 planck**：形状数量大，接缝卡角色，见 ADR 0008。
