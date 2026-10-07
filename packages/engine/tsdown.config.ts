import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'tsdown'

// 发布构建：每个入口打成一个 ESM 文件 + 打包好的类型声明，输出到 dist/。
// 仓库内开发直接用 src/*.ts（package.json 的 exports），发布时由 publishConfig.exports 换成 dist/。
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    browser: 'src/platform/browser/index.ts',
    wechat: 'src/platform/wechat/index.ts',
    // 单独导出：saplingWechat() 的虚拟入口先 import 它，再 import 游戏入口，保证先于任何 pixi.js 模块执行
    'wechat-polyfills': 'src/platform/wechat/polyfills.ts',
    testing: 'src/testing/index.ts',
    vite: 'src/vite/index.ts',
  },
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  clean: true,
  // 运行时依赖和 Node 内置模块不打进包里
  external: [/^pixi\.js/, 'planck', 'vite', /^node:/],
  // 不开 keepNames：dist 不压缩，类名本来就保留；游戏的发布构建由 sapling() / saplingWechat() 开启 keepNames。
  // 在这里开启还会让每个 .d.ts 都 import 运行时的 __name，用户的 tsc 会报 TS7016
  hooks: {
    // 打包类型声明时会丢掉 /// <reference path="./wx.d.ts" />：把 wx.d.ts 复制过去，并给用到它的声明文件补上引用
    'build:done': () => {
      copyFileSync('src/platform/wechat/wx.d.ts', 'dist/wx.d.ts')
      for (const file of readdirSync('dist')) {
        if (!file.endsWith('.d.ts') || file === 'wx.d.ts') continue
        const path = join('dist', file)
        const source = readFileSync(path, 'utf8')
        if (source.includes('WechatMiniGame.')) writeFileSync(path, `/// <reference path="./wx.d.ts" />\n${source}`)
      }
    },
  },
})
