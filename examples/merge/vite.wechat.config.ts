import { defineConfig } from 'vite'
import { sapling, saplingWechat } from 'sapling2d/vite'

// pnpm dev:wechat → 用微信开发者工具打开 dist-wechat/（环境变量：WX_APPID、SAPLING_LOG_URL、SAPLING_RELEASE=1）
export default defineConfig({
  plugins: [sapling(), saplingWechat({ entry: 'src/main.wechat.ts', projectName: 'sapling2d-merge' })],
})
