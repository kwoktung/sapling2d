# 04 — TexturePacker 的 pivot（每张贴图一个锚点）

**What to build:** TexturePacker 可以给每帧导出 `pivot: { x, y }`（0–1）。读取后作为贴图的默认锚点，`Sprite2D` 和 `AnimatedSprite2D` 显示这张贴图时以 pivot 为原点，不再固定用中心。适用于画布尺寸没法统一的素材。

**Blocked by:** 03

**Status:** done（2026-10-10）

只有在 03 证明“统一画布尺寸”这个约定在实际美术管线里行不通时才做。需要决定的问题：

- 和 `centered` / `offset` 的关系（pivot 优先，还是 `centered: false` 时才生效）；
- `HitTester` 和 `hitArea` 默认用贴图范围时要不要跟着锚点偏移；
- Aseprite 一边要不要对应地支持名为 `pivot` 的 slice。

## Comments

**决定和实现（2026-10-10）：**

- 用户要求现在就做（不等 03 证明统一画布行不通）。
- **和 `centered` / `offset` 的关系**：`centered: true`（默认）的含义从“以中心为原点”扩展成“以贴图自己的原点为原点”：帧带锚点时用锚点，没有时用中心。`centered: false` 是明确要左上角，忽略锚点。`offset` 照常叠加在上面。这样已有代码的行为不变（没有锚点的贴图还是居中），用了锚点的图集不用改任何代码。
- **点击范围**：`Sprite2D.rect`（没设 `hitArea` 时的点击范围）跟着锚点。`HitTester` 用的是游戏自己的 `hitShape`，不受影响。
- **Aseprite 不跟进**：一个 Aseprite 文件的帧共用画布，不需要锚点；`slice()` 的坐标仍以画布中心为原点（Aseprite 的帧没有锚点，两者一致）。以后真有需要再加“名为 pivot 的 slice”的约定。
- 读取 `pivot`（TexturePacker 通用 JSON）和 `anchor`（PixiJS 格式）两个字段，存进 `TextureFrame.pivot`，公开为 `Texture.pivot`（0–1，相对裁剪前的原始尺寸，和 Pixi 的 `anchor` 同一个坐标系）。正好是 (0.5, 0.5) 时当作没有。不是有限数时加载报错。
- 渲染：`SpriteContent` 把锚点写到 Pixi 的 `anchor`；帧动画切到锚点不同的帧时跟着变（换贴图本来就会触发同步）；闪白的覆盖层复制 `anchor`，也对齐。
- 测试：解析（`pivot` / `anchor` / 中心当作没有 / 报错）、`rect` 和点击范围、渲染的 `anchor`、切帧、覆盖层、`centered: false`。llms.txt 的 TexturePacker 一节补了“画布没法统一时用锚点”。
- 没有在浏览器里看画面：Pixi 的 `anchor` 配合裁剪（trim）是它自己的标准行为，同步测试已经检查了写进去的值。
