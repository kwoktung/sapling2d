# sapling2d

English | [简体中文](./README.zh-CN.md)

A code-first, agent-friendly 2D game engine for TypeScript.

- **Godot-style node tree**: `Node`, `Node2D`, `Scene`, typed signals, groups, autoloads, timers, tweens and pausing.
- **PixiJS v8 rendering** and **planck.js (Box2D) physics**: `RigidBody2D`, `StaticBody2D`, `Area2D`, collision layers and contact signals.
- **Write once, run in two places**: in the browser, and as a **WeChat Mini Game** with a built-in adapter and Vite plugin.
- **Deterministic headless testing**: `sapling2d/testing` steps the game frame by frame in Vitest and dumps the scene tree as text.
- **Agent friendly**: all of it is plain code, with no editor or scene files. [`llms.txt`](./packages/engine/llms.txt) holds the whole API, runnable examples and known pitfalls in one file, generated from tested examples.

> Status: 0.1, an early MVP. The API may change before 1.0.

## Install

```sh
npm install sapling2d
npm install -D vite vitest typescript
```

## Quick start

```ts
import { Node2D, Scene, v } from 'sapling2d'
import { startGame } from 'sapling2d/browser'

class Mover extends Node2D {
  speed = 120 // px/s
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

Test it headlessly:

```ts
import { createTestGame } from 'sapling2d/testing'

const g = await createTestGame({ main: Main, seed: 1 })
g.step(60) // 60 frames = 1 second, deterministic
expect(g.scene.mover.x).toBeCloseTo(220)
console.log(g.dump())
// Main (Main) position=(0, 0)
//   Mover (Mover) position=(220, 200)
```

## Entry points

| Import | Use |
| --- | --- |
| `sapling2d` | Nodes, scenes, signals, math, physics, audio, storage |
| `sapling2d/browser` | `startGame()` for the web |
| `sapling2d/wechat` | `startGame()` for WeChat Mini Games |
| `sapling2d/testing` | `createTestGame()` for headless tests |
| `sapling2d/vite` | `sapling()` asset checks, `saplingWechat()` mini game build, `startLogServer()` |

## WeChat Mini Game

Add a second Vite config:

```ts
// vite.wechat.config.ts
import { defineConfig } from 'vite'
import { sapling, saplingWechat } from 'sapling2d/vite'

export default defineConfig({
  plugins: [sapling(), saplingWechat({ entry: 'src/main.wechat.ts' })],
})
```

Then run `vite build -c vite.wechat.config.ts --watch` and open `dist-wechat/` in WeChat DevTools. Set `WX_APPID` to your AppID or test account. Use `SAPLING_RELEASE=1` for real-device previews, since dev builds go over the 4 MB limit.

## Repository

- [`packages/engine`](./packages/engine): the engine, published as `sapling2d`
- [`templates/game`](./templates/game): a starter project, with an `AGENTS.md` guide for coding agents
- [`examples/`](./examples): sprite, physics, WeChat tree, and a Suika-style merge game
- [`docs/adr`](./docs/adr): architecture decisions

```sh
pnpm install
pnpm check                      # typecheck + tests for every package
pnpm --filter example-merge dev
```

## License

[MIT](./LICENSE)
