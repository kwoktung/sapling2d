# 01 — 核心：帧动画的每帧时长

**What to build:** `SpriteAnimation` 新增 `durations`（每帧秒数），让一套动画里的帧可以长短不一；同时提供查询接口，让游戏能把攻速和动画时长对上，并算出命中帧在什么时候。

```ts
new AnimatedSprite2D({
  animations: {
    idle: { frames: idleFrames, fps: 8 },
    // 前摇停住 0.2 秒，出手帧 0.04 秒，收招 0.15 秒
    attack: { frames: atkFrames, durations: [0.1, 0.2, 0.04, 0.04, 0.15], loop: false },
  },
})

// 攻击间隔比动画短时加速播放
hero.speedScale = Math.max(1, hero.getAnimationDuration('attack') / interval)
// 第 2 帧（出手）开始的时间点，弹道按它发射
const hitAt = hero.getFrameTime('attack', 2) / hero.speedScale
```

**Blocked by:** None — can start immediately

**Status:** done（2026-10-10）

- [x] `SpriteAnimation.durations?: readonly number[]`（秒）：长度必须和 `frames` 相同，每个值 > 0，否则构造时报错并给出动画名；和 `fps` 同时传时报错。只有一套动画时的简写（`frames` + `durations`）同样可用
- [x] 没有 `durations` 时行为和现在完全一样（每帧 `1 / fps`）；现有测试全部通过
- [x] 推进逻辑按当前帧的时长计算；`speedScale` 很大、一个 dt 跨好几帧时仍然逐帧触发 `frameChanged`（补测试：命中帧不会被跳过）；循环、不循环、`animationFinished` 的语义不变
- [x] 查询（不受 `speedScale` 影响，单位秒）：`getAnimationDuration(name?)` 是一轮的总时长；`getFrameTime(name, frame)` 是这一帧开始的时间点。名字不存在时报错，和 `play()` 的报错一致
- [x] 不分配内存：推进时不创建数组和闭包（构造时把时长解析成一个数组）
- [x] `dump` 不变
- [x] `docs/examples/animation.test.ts` 加一个“长短不一的攻击动作 + 按攻速加速”的示例，`pnpm --filter sapling2d llms` 重新生成；`llms.txt` 帧动画一节说明 `durations`、两个查询接口、`speedScale` 下逐帧触发
- [x] `pnpm check` 通过

## Comments

**实现（2026-10-10）：**

- `AnimatedSprite2D` 构造时把每套动画解析成 `durations`（没有时填 `1 / fps`）和 `starts`（每帧开始的时间点，最后多一项是总时长）。推进时用 `durations[frame]` 代替原来的 `1 / fps`，while 循环和 EPSILON 不变，所以只用 `fps` 的动画行为完全一样。
- 校验集中在模块函数 `resolveAnimation()`：帧数为 0、`fps` 和 `durations` 同时传、长度不一致、某帧 ≤ 0 或非有限值都会报错，错误信息带动画名和帧号。
- 新接口 `getAnimationDuration(name = 当前动画)`、`getFrameTime(name, frame)`；内部的 `_resolve()` 换成返回动画的 `_get()`，未知名字的报错和 `play()` 一样。
- 测试：`test/animation.test.ts` 加 4 个（长短不一的推进和循环、speedScale 跨帧时逐帧触发 frameChanged、两个查询接口、参数错误）；`docs/examples/animation-timing.test.ts` 是新示例（英雄攻击：命中帧结算、按攻速加速、`windup`），`llms.txt` 帧动画一节下新增“每帧时长”小节。
