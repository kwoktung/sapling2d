# 02 — `aseprite()` 导入器

**What to build:** 读取 Aseprite 导出的图集 JSON，把 tag 变成动画、每帧的 `duration` 变成 01 的 `durations`、slices 变成挂点。美术在 Aseprite 里调好节奏，导出之后程序不用改任何数字。

导出命令（写进 `llms.txt`）：

```sh
aseprite -b hero.aseprite --sheet public/assets/hero.png --data src/hero.json \
  --format json-array --list-tags --list-slices --sheet-type packed
```

```ts
import heroData from './hero.json'

static assets = { hero: aseprite<'idle' | 'attack'>('hero.png', heroData) }

this.hero = this.add(new AnimatedSprite2D({
  animations: Main.assets.hero.animations({ attack: { loop: false } }), // tag → 动画；可以覆盖 loop
  autoplay: true,
}))
// 挂点：当前帧里 muzzle slice 的 pivot，坐标相对精灵中心（和 centered 的 Sprite2D 一致）
const p = Main.assets.hero.slice('muzzle', this.hero.texture)
```

**Blocked by:** 01

**Status:** done（2026-10-10）

- [x] `aseprite<A extends string = string>(path, data)`：返回的资源可以放进 `static assets`（加载、卸载和 `atlas()` 一样）；JSON Hash 和 JSON Array 都支持，帧按导出顺序编号（Hash 也按导出顺序，不按名字排序）；trimmed 照常支持，rotated 报错（复用 `Atlas` 的逻辑）
- [x] `frames()` / `frame(i)` / `count`：全部帧，和 `sheet()` 的用法一致
- [x] tag → 动画：`animation(name, overrides?)` 返回 `SpriteAnimation`（`frames` + `durations`，毫秒除以 1000）；`animations(overrides?)` 返回全部 tag。`A` 只是类型标注：运行时检查 JSON 里确实有这些 tag，缺了就报错，列出现有的 tag
- [x] 方向：`forward` / `reverse` / `pingpong` / `pingpong_reverse` 展开成帧序列（pingpong 往回走时不重复首尾两帧，和 Aseprite 的播放一致）
- [x] 重复次数：tag 没有 `repeat` 时 `loop: true`；有 `repeat: N` 时展开 N 遍、`loop: false`；`overrides` 里的 `loop` 优先
- [x] 没有 tag 的文件：`animation()` 不传名字时把全部帧当作一套动画
- [x] slices：`slice(name, frame)` 返回 `{ bounds: Rect2, pivot: Vector2 | null }`，坐标相对精灵中心；key 的作用范围是从它的帧号开始，直到下一个 key；这一帧还没有 key 时返回 null；名字不存在时报错。不分配内存的要求：构造时预先算好，查询时返回已有的对象
- [x] 提醒：导出时漏了 `--list-tags` 或 `--list-slices`，JSON 里就没有 `frameTags` / `slices`。调用 `animation(name)` 或 `slice()` 时，如果 `meta` 里根本没有这些字段，报错信息要提示加这两个参数
- [x] `sapling2d/vite` 插件照常检查 png 路径是否存在
- [x] 测试用手写的 Aseprite JSON fixture（不要求装 Aseprite）：覆盖四种方向、repeat、Hash 和 Array、trimmed、slices 的 key 范围
- [x] `docs/examples/` 加 `aseprite.test.ts`，`llms.txt` 新增“Aseprite 动画”一节：导出命令、tag 和覆盖 loop、挂点、在 `frameChanged` 里按帧号结算命中
- [x] `pnpm check` 通过

## Comments

**实现（2026-10-10）：**

- 新文件 `src/core/aseprite.ts`：`AsepriteSheet<A>`（`kind = 'aseprite'`）+ `aseprite<A>(path, data)`。图集帧的解析从 `Atlas` 抽成 `atlasFrame()`（`assets.ts`），两边共用；`assetRoot` 按 `kind` 认出它（避免循环依赖，和 TileSet 一样）。
- 帧路径用帧号（`hero.png#3`），不用 Aseprite 的文件名（`hero 3.aseprite`）。缺 `duration` 时按 Aseprite 默认的 100 毫秒。
- **和工单的出入**：
  - 类型参数 `A` 在运行时检查不了（类型被擦除），所以“缺 tag 就报错”发生在用到它的时候：`animation(name)`、`animations()` 的覆盖项、`AnimatedSprite2D.play()`。
  - `slice(name, frame)` 的 `frame` 也可以传贴图：`sprite.frame` 是动画里的序号，不是图里的帧号，写示例时才发现这个坑。播放中的精灵传 `sprite.texture`（类型是 `Texture | null`，所以也接受 null，传 null 时报错）。
  - 不循环、又没设 repeat 的 pingpong 走一个来回（等同 repeat 2）；设了 repeat 却覆盖成循环时，按循环的一轮处理（不重复两端）。
- vite 插件：`ASSET_CALL` 加 `aseprite`，函数名后面允许类型参数（`aseprite<'idle'>('hero.png', …)`）。插件是 `enforce: 'pre'`，看到的是带类型的 TS 源码。
- 测试：`test/aseprite.test.ts` 12 个（Array / Hash 的帧顺序、trimmed、时长、四种方向、repeat、覆盖 loop、无 tag、各种报错、slices 的 key 范围和共用对象、按贴图查 slice、场景加载和卸载、交给 AnimatedSprite2D 播放）；`vite-plugin.test.ts` 加类型参数的用例。`docs/examples/aseprite.test.ts` + `hero.json`（仿 Aseprite 1.3 的真实输出，顺便验证了 JSON import 的类型能赋给 `AsepriteData`），`llms.txt` 新增“Aseprite 动画”小节。
- 没有在真实 Aseprite 导出的文件上验证（本机没装 Aseprite）。pingpong 加 repeat 的展开规则是按 Aseprite 1.3 的播放行为推断的，拿到真实素材后要对一次。

**代码审查后的修正（2026-10-10）：**

- vite 插件的类型参数可以跨行（格式化工具会把长的 tag 联合类型拆开），否则这种写法的图片路径不会被检查。
- tag 重名时报错（之前后一个会悄悄覆盖前一个）。
- slice 坐标的原点改成这个 key 所在帧的画布中心（之前固定用第 0 帧的尺寸）。
- 帧时长是 Infinity 时在 `aseprite()` 里报错，不再拖到 `AnimatedSprite2D`。
- `frames(start, end)` 在 start > end 时报错，`sheet()` 和 `aseprite()` 都是；JSON Array / Hash 的整理抽成 `atlasEntries()`，和 `Atlas` 共用。
