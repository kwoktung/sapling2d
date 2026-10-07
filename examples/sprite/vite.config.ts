import { defineConfig } from 'vite'
import { sapling } from 'sapling2d/vite'

// 资源放在 public/assets/：tex('fruit.png') 对应 public/assets/fruit.png，路径写错时构建失败、开发时显示错误浮层
export default defineConfig({ plugins: [sapling()] })
