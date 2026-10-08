// 弹幕压测的微信小游戏构建（真机测帧率）。见 REPORT.md「真机」一节。
// WX_APPID=... SAPLING_RELEASE=1 SAPLING_LOG_URL=http://<局域网 IP>:7777/log \
//   pnpm --filter example-sprite exec vite build -c ../../spikes/bullets/vite.wechat.config.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { saplingWechat } from '../../packages/engine/src/vite/wechat.ts'

const engine = fileURLToPath(new URL('../../packages/engine', import.meta.url))

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: [
      { find: /^sapling2d$/, replacement: `${engine}/src/index.ts` },
      { find: /^sapling2d\/wechat$/, replacement: `${engine}/src/platform/wechat/index.ts` },
      { find: /^sapling2d\/wechat-polyfills$/, replacement: `${engine}/src/platform/wechat/polyfills.ts` },
      // spike 的入口直接用到 pixi.js（DOMAdapter）：用引擎依赖的那一份
      { find: /^pixi\.js$/, replacement: `${engine}/node_modules/pixi.js` },
      { find: /^@engine\//, replacement: `${engine}/` },
    ],
  },
  plugins: [saplingWechat({ entry: 'src/main.wechat.ts', projectName: 'sapling2d-bullets' }), ...(process.env.BULLETS_TARGET ? [target(process.env.BULLETS_TARGET)] : [])],
}

/**
 * 实验：覆盖 saplingWechat 的 ES2017 目标（ES2017 会把 #private 字段编译成 WeakMap 辅助函数）。
 * 同时关掉开发者工具上传时的 ES5 转换（es6 / enhance），否则它会再降级一次。
 */
function target(t: string) {
  return {
    name: 'bullets:target',
    config: () => ({ build: { target: t }, define: { __BULLETS_BUILD__: JSON.stringify(t) } }),
    closeBundle() {
      const file = fileURLToPath(new URL('dist-wechat/project.config.json', import.meta.url))
      const json = JSON.parse(readFileSync(file, 'utf8'))
      json.setting = { ...json.setting, es6: false, enhance: false }
      writeFileSync(file, JSON.stringify(json, null, 2))
    },
  }
}
