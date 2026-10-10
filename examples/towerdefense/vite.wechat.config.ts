import { defineConfig } from 'vite'
import { sapling, saplingWechat } from 'sapling2d/vite'

export default defineConfig({ plugins: [sapling(), saplingWechat({ entry: 'src/main.wechat.ts', projectName: 'sapling2d-towerdefense' })] })
