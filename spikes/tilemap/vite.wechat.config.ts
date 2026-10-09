// TileMap 渲染压测的微信小游戏构建（横屏，真机测帧率）。见 REPORT.md「运行」一节。
// WX_APPID=... SAPLING_RELEASE=1 SAPLING_LOG_URL=http://<局域网 IP>:7777/log \
//   pnpm --filter example-sprite exec vite build -c ../../spikes/tilemap/vite.wechat.config.ts
import { fileURLToPath } from 'node:url'
import { saplingWechat } from '../../packages/engine/src/vite/wechat.ts'

const engine = fileURLToPath(new URL('../../packages/engine', import.meta.url))

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: [
      { find: /^sapling2d\/wechat$/, replacement: `${engine}/src/platform/wechat/index.ts` },
      { find: /^sapling2d\/wechat-polyfills$/, replacement: `${engine}/src/platform/wechat/polyfills.ts` },
      { find: /^pixi\.js$/, replacement: `${engine}/node_modules/pixi.js` },
      { find: /^@engine\//, replacement: `${engine}/` },
    ],
  },
  plugins: [saplingWechat({ entry: 'src/main.wechat.ts', projectName: 'sapling2d-tilemap', orientation: 'landscape' })],
}
