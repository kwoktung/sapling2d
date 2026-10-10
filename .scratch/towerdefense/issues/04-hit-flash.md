# 04 — 引擎：受击闪白（`Sprite2D.flash`）

**What to build:** 原型验证出来的 P1：`modulate` 只能变暗，做不出闪白；原型里用预先画好的白色剪影图 + 每只怪多一个子精灵绕过，换成帧动画的怪以后每帧都要一张剪影。给 `Sprite2D` 加闪白。

**Blocked by:** 01

**Status:** done（2026-10-10）

- [x] `Sprite2D.flash`（0–1）和 `flashColor`（默认白色）：构造参数、属性、`dump`；都能补间（颜色按 RGB 通道）
- [x] 帧动画、图集的帧、翻转、`offset` 都对齐；只作用于自己的贴图
- [x] 渲染测试（覆盖层的位置、顺序、隐藏、销毁）+ `docs/examples/flash.test.ts`，`llms.txt` 新增“受击闪白”小节
- [x] 塔防原型的怪改用 `flash`，删掉手画的剪影图和子精灵；浏览器里确认剪影正确

## Comments

**实现（2026-10-10）：**

- **方案**：一张图第一次闪白时，在显存里用一个着色器把整张图画成白色剪影（`RenderTexture`，每个像素 = (a, a, a, a)），之后这张图的所有帧、所有精灵共用；剪影的帧和原图的帧位置相同，所以图集的帧天然对齐。闪白中的精灵在内容层上面多一个剪影精灵（染成 `flashColor`、透明度 = `flash`），第一次闪白时才创建。
- **没选的方案**：给每个闪白的精灵换一个自定义着色器的 Mesh（混合到目标颜色）。不占额外显存，但每个闪白中的精灵多一次绘制调用（压力测试里同时有约 20 只在闪）。剪影方案和原图合批，不增加绘制调用，代价是每张闪过白的图多一份显存。
- 引擎改动：`Sprite2D`（属性）、`TextureCache.flash()`（剪影和它的帧，卸载时一起释放）、`NodeContent` 加可选的 `overlay`、`PixiRenderer._syncChildren` 把覆盖层排在内容层后面、子节点前面（叶子节点刚多了覆盖层时也会重排）。
- **踩的坑**：
  - Pixi 的 high-shader 里 `localUniformBitGl` 用到 `roundPixelsBitGl` 声明的 `uRound`，少了它着色器编译失败，**Pixi 不报错、什么都不画**。剪影一开始全是透明的，在浏览器里用 `gl.readPixels` 读 RenderTexture 才查出来。注释写在 `silhouetteProgram()` 上。
  - 私有字段一开始叫 `_flash`，和 `examples/plane` 里 Boss / Enemy 自己的 `_flash` 冲突（TS 的同名私有字段编译失败）。游戏的子类很可能自己有这个名字，改成 `_flashAmount` / `_flashTint`。引擎其他类的私有字段也有同样的风险，没有统一处理。
- 浏览器（Chrome）验证：弓手待机帧全白、法师停在出手帧（拉长的身体、法杖和闪光）的剪影完全对齐、剑士半强度红色闪光，和不闪的剑士对比正常。剪影在 WebGL1 小游戏上也正常（2026-10-10，iPhone 17，`VITE_VERIFY=1` 截图 `../assets/iphone-flash-additive.png`）：怪物全白 / 半白 / 不闪对比清楚；弓手全白；法师和剑士停在攻击动画中间的帧，剪影和当帧的形状（包括法杖、压扁的身体）对齐；剑士半强度红色正确。
