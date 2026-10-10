# 02 — 美术管线脚本：生成、抠图、缩放、打包

**What to build:** `examples/hero-guard/scripts/art/` 下的一组 Node 脚本，把“提示词 → 游戏里能用的图集”变成一条命令。素材清单（每个素材的提示词、背景色、参考图、显示尺寸、所属图集）写成数据文件，改了提示词重跑就能更新素材。

**Blocked by:** None — can start immediately

**Status:** done（2026-10-10）

- [x] 素材清单 `art/assets.ts`（或 JSON）：`id`、`prompt`、`refs`（参考图，如风格锚点、完整角色图）、`background`（默认 `#FF00FF`）、`displayHeight`（游戏里显示的高度，像素）、`atlas`（打进哪张图集）、`mode`（`generate` 生成 / `edit` 基于参考图编辑）
- [x] 风格模板 `art/style.md`：所有提示词共用的风格描述（Q 版西幻、粗描边、平涂、鲜艳、纯色背景、不要阴影 / 文字 / 边框），生成时自动拼在每个提示词后面
- [x] `gen`：调 Gemini API（`gemini-3.1-flash-image`，key 读 `GEMINI_API_KEY`），支持参考图；原图存 `art/raw/<id>.<ext>`（gitignore）；已有原图时跳过，`--force` / `--only <id>` 重生成；并发数可配，失败重试一次；用 Node 的 `fetch`，不用 Python（本机 pyenv 的 hashlib 有问题）
- [x] `key`：按颜色距离抠掉背景色（容差可配），去掉边缘残留的背景色（despill），把模型画的“背景色阴影”（比背景暗的同色相区域）也抠掉；裁掉透明边
- [x] `resize`：按 `displayHeight × 2` 缩放，存 `art/sprites/<id>.png`（进 git）
- [x] `pack`：按 `atlas` 分组打成图集（maxrects，不旋转，开启 trim，2 像素间距），输出 `public/assets/<atlas>.png` + TexturePacker 格式 JSON（`atlas()` 直接读）；单张图集不超过 2048×2048
- [x] 一条命令跑完整条管线（`pnpm art`），也能单独跑每一步；输出一张所有素材的预览拼图（`art/preview.png`，不进 git）方便检查
- [x] 用灰盒原型里的弓手测试图走通整条管线：品红背景、带阴影的原图 → 干净的透明 PNG → 图集 → 游戏里显示正常
- [x] 依赖（如 `sharp`、`maxrects-packer`）放 devDependencies；README 一段写清楚怎么用、key 放哪

## Comments

**实现（2026-10-10）：**

- `art/assets.ts`（清单 + `STYLE_ANCHOR`）、`art/style.md`（风格模板）、`scripts/art/pipeline.ts`（`pnpm art [step] [--only ids] [--force]`）、`scripts/art/key.ts`（抠图）、`scripts/art/README.md`。脚本是 TypeScript，Node 26 直接跑（相对 import 带 `.ts`）。依赖 `sharp`、`maxrects-packer`（devDependencies）。
- **生成**：Node `fetch` 调 `gemini-3.1-flash-image`，参考图按文件内容判断 PNG / JPEG（模型返回的是 JPEG）；先跑 generate 再跑 edit（edit 依赖前者的原图）；每批 3 个并发，失败重试一次；换了格式时删掉旧原图。
- **抠图**（`chromaKey`）：按色度（颜色减灰度）和背景色色度的夹角（`cos`）和强度（`s`）判断。
  1. 从四边、以及“几乎就是背景色”的像素开始泛洪，色相一致、色度够强的相连像素都算背景——这样背景上的阴影（同色相、更暗）和被围住的背景（弓和弓弦之间）都能去掉，而深色描边挡住泛洪，角色身上相近但不纯的颜色不受影响；
  2. 泛洪到、但紧挨着角色的那圈像素：和 2 像素内真正的背景比色度强度算透明度，再按那个背景的颜色还原前景色（阴影边上的像素算出来约 0，照样去掉）；没泛洪到但挨着背景的像素（描边）按 `1 − s`；边缘再去掉残留的背景色色度；
  3. 裁掉透明边（留 2 像素）。
  第一版只从四边泛洪，弓弦围住的品红没去掉；第二版把半覆盖的抗锯齿像素整个当背景删了，边缘变硬——合成图测试抓出来的，改成第 2 步的做法。
- **缩放**：`displayHeight × 2`，lanczos3。**打包**：maxrects（2 像素间距、不旋转），超过 2048 报错；JSON 是 TexturePacker 的 Hash 格式，带清单里的 `pivot`（引擎 0.2.0 的锚点支持）。`--only` 时也会把相关图集整张重打。
- **预览**：所有精灵在棋盘格上的拼图 `art/preview.png`。
- **验证**：风格对比时生成的弓手（品红背景、脚下有阴影）→ 干净的透明图；`--force` 用 API 重新生成一张，整条管线约 14.5 秒；浏览器里把图集的帧换到弓手身上，锚点 (0.5, 1) 让脚底正好在槽位中心。`test/art.test.ts` 4 个测试（合成图抠图、半透明边缘去溢色、报错、图集被 `atlas()` 读回）。
- 清单里暂时留着 `archer_test`（`heroes` 图集），03 换成正式的英雄后删掉。
