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
const p = Main.assets.hero.slice('muzzle', this.hero.frame)
```

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `aseprite<A extends string = string>(path, data)`：返回的资源可以放进 `static assets`（加载、卸载和 `atlas()` 一样）；JSON Hash 和 JSON Array 都支持，帧按导出顺序编号（Hash 也按导出顺序，不按名字排序）；trimmed 照常支持，rotated 报错（复用 `Atlas` 的逻辑）
- [ ] `frames()` / `frame(i)` / `count`：全部帧，和 `sheet()` 的用法一致
- [ ] tag → 动画：`animation(name, overrides?)` 返回 `SpriteAnimation`（`frames` + `durations`，毫秒除以 1000）；`animations(overrides?)` 返回全部 tag。`A` 只是类型标注：运行时检查 JSON 里确实有这些 tag，缺了就报错，列出现有的 tag
- [ ] 方向：`forward` / `reverse` / `pingpong` / `pingpong_reverse` 展开成帧序列（pingpong 往回走时不重复首尾两帧，和 Aseprite 的播放一致）
- [ ] 重复次数：tag 没有 `repeat` 时 `loop: true`；有 `repeat: N` 时展开 N 遍、`loop: false`；`overrides` 里的 `loop` 优先
- [ ] 没有 tag 的文件：`animation()` 不传名字时把全部帧当作一套动画
- [ ] slices：`slice(name, frame)` 返回 `{ bounds: Rect2, pivot: Vector2 | null }`，坐标相对精灵中心；key 的作用范围是从它的帧号开始，直到下一个 key；这一帧还没有 key 时返回 null；名字不存在时报错。不分配内存的要求：构造时预先算好，查询时返回已有的对象
- [ ] 提醒：导出时漏了 `--list-tags` 或 `--list-slices`，JSON 里就没有 `frameTags` / `slices`。调用 `animation(name)` 或 `slice()` 时，如果 `meta` 里根本没有这些字段，报错信息要提示加这两个参数
- [ ] `sapling2d/vite` 插件照常检查 png 路径是否存在
- [ ] 测试用手写的 Aseprite JSON fixture（不要求装 Aseprite）：覆盖四种方向、repeat、Hash 和 Array、trimmed、slices 的 key 范围
- [ ] `docs/examples/` 加 `aseprite.test.ts`，`llms.txt` 新增“Aseprite 动画”一节：导出命令、tag 和覆盖 loop、挂点、在 `frameChanged` 里按帧号结算命中
- [ ] `pnpm check` 通过

## Comments
