import { defineConfig } from 'vite'
import { sapling, saplingWechat } from 'sapling2d/vite'

// pnpm dev:wechat → 用微信开发者工具打开 dist-wechat/
// 环境变量：WX_APPID（小游戏 AppID / 测试号）、SAPLING_LOG_URL（局域网日志服务）、SAPLING_RELEASE=1（真机预览）
export default defineConfig({
  plugins: [sapling(), saplingWechat({ entry: 'src/main.wechat.ts', projectName: 'sapling2d-sprite' })],
})
