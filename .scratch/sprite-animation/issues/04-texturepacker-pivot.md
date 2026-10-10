# 04 — TexturePacker 的 pivot（每张贴图一个锚点）

**What to build:** TexturePacker 可以给每帧导出 `pivot: { x, y }`（0–1）。读取后作为贴图的默认锚点，`Sprite2D` 和 `AnimatedSprite2D` 显示这张贴图时以 pivot 为原点，不再固定用中心。适用于画布尺寸没法统一的素材。

**Blocked by:** 03

**Status:** needs-triage

只有在 03 证明“统一画布尺寸”这个约定在实际美术管线里行不通时才做。需要决定的问题：

- 和 `centered` / `offset` 的关系（pivot 优先，还是 `centered: false` 时才生效）；
- `HitTester` 和 `hitArea` 默认用贴图范围时要不要跟着锚点偏移；
- Aseprite 一边要不要对应地支持名为 `pivot` 的 slice。

## Comments
