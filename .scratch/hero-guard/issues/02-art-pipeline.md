# 02 — 美术管线脚本：生成、抠图、缩放、打包

**What to build:** `examples/hero-guard/scripts/art/` 下的一组 Node 脚本，把“提示词 → 游戏里能用的图集”变成一条命令。素材清单（每个素材的提示词、背景色、参考图、显示尺寸、所属图集）写成数据文件，改了提示词重跑就能更新素材。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 素材清单 `art/assets.ts`（或 JSON）：`id`、`prompt`、`refs`（参考图，如风格锚点、完整角色图）、`background`（默认 `#FF00FF`）、`displayHeight`（游戏里显示的高度，像素）、`atlas`（打进哪张图集）、`mode`（`generate` 生成 / `edit` 基于参考图编辑）
- [ ] 风格模板 `art/style.md`：所有提示词共用的风格描述（Q 版西幻、粗描边、平涂、鲜艳、纯色背景、不要阴影 / 文字 / 边框），生成时自动拼在每个提示词后面
- [ ] `gen`：调 Gemini API（`gemini-3.1-flash-image`，key 读 `GEMINI_API_KEY`），支持参考图；原图存 `art/raw/<id>.<ext>`（gitignore）；已有原图时跳过，`--force` / `--only <id>` 重生成；并发数可配，失败重试一次；用 Node 的 `fetch`，不用 Python（本机 pyenv 的 hashlib 有问题）
- [ ] `key`：按颜色距离抠掉背景色（容差可配），去掉边缘残留的背景色（despill），把模型画的“背景色阴影”（比背景暗的同色相区域）也抠掉；裁掉透明边
- [ ] `resize`：按 `displayHeight × 2` 缩放，存 `art/sprites/<id>.png`（进 git）
- [ ] `pack`：按 `atlas` 分组打成图集（maxrects，不旋转，开启 trim，2 像素间距），输出 `public/assets/<atlas>.png` + TexturePacker 格式 JSON（`atlas()` 直接读）；单张图集不超过 2048×2048
- [ ] 一条命令跑完整条管线（`pnpm art`），也能单独跑每一步；输出一张所有素材的预览拼图（`art/preview.png`，不进 git）方便检查
- [ ] 用灰盒原型里的弓手测试图走通整条管线：品红背景、带阴影的原图 → 干净的透明 PNG → 图集 → 游戏里显示正常
- [ ] 依赖（如 `sharp`、`maxrects-packer`）放 devDependencies；README 一段写清楚怎么用、key 放哪

## Comments
