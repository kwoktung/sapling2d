// 弹幕压测 spike：直接引用引擎源码（spikes/ 不在 workspace 里）。
// 运行：pnpm --filter example-sprite exec vite --config ../../spikes/bullets/vite.config.ts
import { fileURLToPath } from 'node:url'

const engine = fileURLToPath(new URL('../../packages/engine', import.meta.url))

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: [
      { find: /^sapling2d$/, replacement: `${engine}/src/index.ts` },
      { find: /^sapling2d\/browser$/, replacement: `${engine}/src/platform/browser/index.ts` },
      { find: /^@engine\//, replacement: `${engine}/` },
    ],
  },
  server: { port: 5198, strictPort: true, fs: { allow: [engine, fileURLToPath(new URL('.', import.meta.url))] } },
}
