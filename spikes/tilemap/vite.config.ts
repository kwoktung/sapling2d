// TileMap 渲染压测：直接引用引擎源码（spikes/ 不在 workspace 里）。
// 运行：pnpm --filter example-sprite exec vite --config ../../spikes/tilemap/vite.config.ts
import { fileURLToPath } from 'node:url'

const engine = fileURLToPath(new URL('../../packages/engine', import.meta.url))

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: [
      { find: /^sapling2d\/browser$/, replacement: `${engine}/src/platform/browser/index.ts` },
      // 和引擎用同一份 pixi.js
      { find: /^pixi\.js$/, replacement: `${engine}/node_modules/pixi.js` },
      { find: /^@engine\//, replacement: `${engine}/` },
    ],
  },
  server: { port: 5199, strictPort: true, fs: { allow: [engine, fileURLToPath(new URL('.', import.meta.url))] } },
}
