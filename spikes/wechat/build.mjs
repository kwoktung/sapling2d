// 把 spike 打成小游戏工程：dist/game.js（单文件）+ game.json + project.config.json + assets/
import * as esbuild from 'esbuild'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const watch = process.argv.includes('--watch')
const release = process.argv.includes('--release') // 真机预览：压缩、不带 sourcemap（主包上限 4MB）
const logHost = process.env.LOG_HOST || '127.0.0.1' // 真机需要填这台电脑的局域网 IP
const highPerf = process.env.HIGH_PERF !== '0' // iOS 高性能模式，默认开启
const stress = process.env.STRESS === '1' // 压力测试：自动生成球直到 150 个
const appid = process.env.WX_APPID || 'touristappid'

mkdirSync('dist', { recursive: true })
cpSync('assets', 'dist/assets', { recursive: true })
writeFileSync('dist/game.json', JSON.stringify({ deviceOrientation: 'portrait', showStatusBar: false, iOSHighPerformance: highPerf }, null, 2))
writeFileSync('dist/project.config.json', JSON.stringify({
  appid,
  projectname: 'sapling2d-wechat-spike',
  compileType: 'game',
  libVersion: '3.0.0',
  setting: { es6: true, enhance: true, minified: false, urlCheck: false },
}, null, 2))

const checkForbidden = {
  name: 'check-forbidden',
  setup(build) {
    build.onEnd(() => {
      const out = readFileSync('dist/game.js', 'utf8')
      // pixi 源码里仍有 new Function，但引入 unsafe-eval 后运行时不会走到；这里只检查 eval 和动态 import
      const hits = [/\beval\s*\(/, /\bimport\s*\(/].filter((re) => re.test(out))
      console.log(hits.length ? `⚠️  forbidden constructs found: ${hits.join(', ')}` : '✅ no eval / import() in game.js')
      console.log(`game.js ${(out.length / 1024).toFixed(0)} KB`)
    })
  },
}

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2017',
  outfile: 'dist/game.js',
  sourcemap: release ? false : 'inline',
  minify: release,
  define: { __LOG_URL__: JSON.stringify(`http://${logHost}:7777/log`), __HIGH_PERF__: String(highPerf), __STRESS__: String(stress) },
  logLevel: 'info',
  plugins: [checkForbidden],
  // 在任何模块代码执行之前注册日志和全局错误捕获，模块加载阶段的崩溃也能收到
  banner: {
    js: `(function(){var send=function(tag,data){try{wx.request({url:'http://${logHost}:7777/log',method:'POST',data:JSON.stringify({tag:tag,data:data}),fail:function(e){console.log('[spike] log send failed',e&&e.errMsg)}})}catch(e){}};GameGlobal.__spikeLog=send;send('boot',{t:Date.now()});wx.onError&&wx.onError(function(e){send('onError(early)',{message:e&&e.message,stack:e&&e.stack})});})();`,
  },
})
if (watch) await ctx.watch()
else { await ctx.rebuild(); await ctx.dispose() }
