# sapling2d

[English](./README.md) | 简体中文

代码优先、对 AI Agent 友好的 TypeScript 2D 游戏引擎。

- **Godot 风格节点树**：`Node`、`Node2D`、`Scene`，以及类型安全的信号、分组、Autoload、计时器、补间和暂停。
- **渲染与物理**：渲染用 PixiJS v8，物理用 planck.js（Box2D）。提供 `RigidBody2D`、`StaticBody2D`、`Area2D`、碰撞层和接触信号。
- **一份代码，两端运行**：浏览器，以及**微信小游戏**。引擎内置小游戏适配层和 Vite 插件。
- **确定性的无头测试**：`sapling2d/testing` 可以在 Vitest 里逐帧推进游戏，并把场景树导出成文本。
- **对 Agent 友好**：一切都写在代码里，不需要编辑器，也没有场景文件。[`llms.txt`](./packages/engine/llms.txt) 用一个文件收录了完整 API、可运行示例和常见坑，内容由经过测试的示例生成。

> 状态：0.1，早期 MVP，1.0 之前 API 可能变化。

## 安装

```sh
npm install sapling2d
npm install -D vite vitest typescript
```

## 快速开始

```ts
import { Node2D, Scene, v } from 'sapling2d'
import { startGame } from 'sapling2d/browser'

class Mover extends Node2D {
  speed = 120 // 像素/秒
  override process(dt: number) {
    this.x += this.speed * dt
  }
}

class Main extends Scene {
  mover!: Mover
  override ready() {
    this.mover = this.add(new Mover({ name: 'Mover', position: v(100, 200) }))
  }
}

await startGame({ main: Main })
```

无头测试：

```ts
import { createTestGame } from 'sapling2d/testing'

const g = await createTestGame({ main: Main, seed: 1 })
g.step(60) // 推进 60 帧 = 1 秒，结果确定
expect(g.scene.mover.x).toBeCloseTo(220)
console.log(g.dump())
// Main (Main) position=(0, 0)
//   Mover (Mover) position=(220, 200)
```

## 入口

| 导入 | 用途 |
| --- | --- |
| `sapling2d` | 节点、场景、信号、数学、物理、音频、存储 |
| `sapling2d/browser` | 浏览器端 `startGame()` |
| `sapling2d/wechat` | 微信小游戏端 `startGame()` |
| `sapling2d/testing` | 无头测试 `createTestGame()` |
| `sapling2d/vite` | `sapling()` 资源路径检查、`saplingWechat()` 小游戏构建、`startLogServer()` 真机日志 |

## 微信小游戏

单独写一个 Vite 配置：

```ts
// vite.wechat.config.ts
import { defineConfig } from 'vite'
import { sapling, saplingWechat } from 'sapling2d/vite'

export default defineConfig({
  plugins: [sapling(), saplingWechat({ entry: 'src/main.wechat.ts' })],
})
```

运行 `vite build -c vite.wechat.config.ts --watch`，再用微信开发者工具打开 `dist-wechat/`。环境变量 `WX_APPID` 设为你的 AppID 或测试号。开发构建会超过 4 MB，真机预览要加 `SAPLING_RELEASE=1`。

## 仓库结构

- [`packages/engine`](./packages/engine)：引擎本体，以 `sapling2d` 发布到 npm
- [`templates/game`](./templates/game)：新游戏模板，附带给编程 Agent 的 `AGENTS.md`
- [`examples/`](./examples)：精灵、物理、小游戏示例树，以及一个合成大西瓜风格的小游戏
- [`docs/adr`](./docs/adr)：架构决策记录

```sh
pnpm install
pnpm check                      # 所有包的类型检查和测试
pnpm --filter example-merge dev
```

## 许可证

[MIT](./LICENSE)
