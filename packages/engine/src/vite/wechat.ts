import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { join, resolve, sep } from 'node:path'
import type { Plugin } from 'vite'

export interface SaplingWechatOptions {
  /** 入口文件（相对于 Vite root），里面调用 `startGame` from 'sapling2d/wechat'。 */
  entry: string
  /** 输出目录（相对于 root），用微信开发者工具打开它。默认 `dist-wechat`。 */
  outDir?: string
  /** 小游戏 AppID。默认读环境变量 WX_APPID；都没有时用 'touristappid'（开发者工具里小游戏不支持游客 AppID，需要测试号）。 */
  appid?: string
  /** 项目名，默认 'sapling2d-game'。 */
  projectName?: string
  /** 屏幕方向，默认 'portrait'。 */
  orientation?: 'portrait' | 'landscape' | 'landscapeLeft' | 'landscapeRight'
  /** iOS 高性能模式（有 JIT），默认 true。见 spikes/wechat/REPORT.md。 */
  iOSHighPerformance?: boolean
  /** 资源目录（相对于 root），会被拷贝到输出目录的 assets/。默认 `public/assets`。 */
  assetsDir?: string
  /**
   * 发布构建：压缩、不带 sourcemap。默认读环境变量 SAPLING_RELEASE=1。
   * 开发构建带内联 sourcemap，体积会超过 4MB，只能在模拟器里跑；真机预览必须用发布构建。
   */
  release?: boolean
  /**
   * 局域网日志服务地址，如 'http://192.168.1.10:7777/log'（见 startLogServer）。默认读环境变量 SAPLING_LOG_URL。
   * 设置后，game.js 会把启动、未捕获错误和 console 输出 POST 到这里，方便在电脑上看真机日志。
   * 真机需要打开“开发调试”才能访问非 https 地址。
   */
  logUrl?: string | null
}

const NO_EVAL_CALL = '(function () { throw new Error("[sapling2d] new Function is not allowed in WeChat Mini Games") })('

/** 小游戏不允许的写法：执行时会直接报错。 */
const FORBIDDEN: [RegExp, string][] = [
  [/(?<![.\w$])eval\s*\(/, 'eval('],
  [/\bnew\s+Function\s*\(/, 'new Function('],
  [/(?<![.\w$])import\s*\(/, 'dynamic import()'],
]

/**
 * 把游戏构建成微信小游戏工程：单个 CommonJS 的 `game.js`、`game.json`、`project.config.json` 和 `assets/`。
 *
 * ```ts
 * // vite.wechat.config.ts
 * import { defineConfig } from 'vite'
 * import { sapling, saplingWechat } from 'sapling2d/vite'
 * export default defineConfig({ plugins: [sapling(), saplingWechat({ entry: 'src/main.wechat.ts' })] })
 * ```
 *
 * 开发：`vite build -c vite.wechat.config.ts --watch`，用微信开发者工具打开输出目录（它会自动重新编译）。
 * 真机预览：`SAPLING_RELEASE=1 vite build -c vite.wechat.config.ts`。
 */
export function saplingWechat(options: SaplingWechatOptions): Plugin {
  const release = options.release ?? process.env.SAPLING_RELEASE === '1'
  const logUrl = options.logUrl === undefined ? (process.env.SAPLING_LOG_URL ?? null) : options.logUrl
  let root = ''
  let outDir = ''

  return {
    name: 'sapling2d:wechat',
    config(config) {
      root = resolve(config.root ?? process.cwd())
      outDir = resolve(root, options.outDir ?? 'dist-wechat')
      return {
        publicDir: false,
        define: { 'process.env.NODE_ENV': JSON.stringify(release ? 'production' : 'development') },
        build: {
          outDir,
          // 不清空：保留开发者工具写入的 project.private.config.json
          emptyOutDir: false,
          copyPublicDir: false,
          target: 'es2017',
          minify: release,
          sourcemap: release ? false : 'inline',
          lib: { entry: resolve(root, options.entry), formats: ['cjs'], fileName: () => 'game.js' },
          // keepNames：压缩后节点的默认名字和 dump() 里的类名仍然可读（真机调试时曾经显示成 cP、_P）
          rolldownOptions: { output: { banner: bootBanner(logUrl), inlineDynamicImports: true, keepNames: true } },
        },
      }
    },

    /**
     * Pixi 源码里有几处 `new Function(...)`（着色器 / uniform 同步代码生成）。引入 `pixi.js/unsafe-eval` 后
     * 它们不会被执行，但小游戏不允许这种写法，这里替换成直接抛错的函数，让产物通过检查。
     */
    transform(code, id) {
      if (!/[\\/]pixi\.js[\\/]/.test(id) || !code.includes('new Function(')) return null
      return { code: code.replace(/\bnew Function\(/g, NO_EVAL_CALL), map: null }
    },

    writeBundle() {
      const gameJs = join(outDir, 'game.js')
      const code = readFileSync(gameJs, 'utf8')
      const body = code.replace(/\/\/# sourceMappingURL=.*$/m, '')
      const found = FORBIDDEN.filter(([re]) => re.test(body)).map(([, name]) => name)
      if (found.length) {
        throw new Error(`[sapling2d:wechat] game.js contains ${found.join(', ')}, which WeChat Mini Games do not allow.`)
      }
      writeJson(join(outDir, 'game.json'), {
        deviceOrientation: options.orientation ?? 'portrait',
        showStatusBar: false,
        iOSHighPerformance: options.iOSHighPerformance ?? true,
      })
      writeJson(join(outDir, 'project.config.json'), {
        appid: options.appid ?? process.env.WX_APPID ?? 'touristappid',
        projectname: options.projectName ?? 'sapling2d-game',
        compileType: 'game',
        libVersion: '3.0.0',
        // urlCheck: false 才能在开发时访问局域网日志服务
        setting: { es6: true, enhance: true, minified: false, urlCheck: logUrl === null },
      })
      const assets = resolve(root, options.assetsDir ?? join('public', 'assets'))
      if (existsSync(assets)) cpSync(assets, join(outDir, 'assets'), { recursive: true })
      const kb = (Buffer.byteLength(code) / 1024).toFixed(0)
      this.info?.(`game.js ${kb} KB${release ? '' : ' (dev build with inline sourcemap: simulator only)'}`)
    },
  }
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
}

/**
 * 注入到 game.js 最前面的启动代码（ES5，先于任何模块执行）：
 * 记录启动，捕获未处理的错误；配置了日志服务时，把这些以及 console 输出转发过去。
 */
function bootBanner(logUrl: string | null): string {
  return `;(function () {
  var url = ${JSON.stringify(logUrl)};
  var hasWx = typeof wx !== 'undefined';
  function send(tag, data) {
    if (!url || !hasWx) return;
    try { wx.request({ url: url, method: 'POST', data: JSON.stringify({ tag: tag, data: data, t: Date.now() }), fail: function () {} }); } catch (e) {}
  }
  if (typeof GameGlobal !== 'undefined') GameGlobal.__saplingLog = send;
  send('boot', {});
  if (hasWx && wx.onError) wx.onError(function (e) { send('error', { message: e && e.message, stack: e && e.stack }); });
  if (url) ['log', 'warn', 'error'].forEach(function (level) {
    var orig = console[level];
    console[level] = function () {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) { var a = arguments[i]; try { parts.push(typeof a === 'string' ? a : JSON.stringify(a)); } catch (e) { parts.push(String(a)); } }
      send(level, parts.join(' '));
      return orig.apply(console, arguments);
    };
  });
})();`
}

export interface LogServerOptions {
  /** 默认 7777。 */
  port?: number
  /** 默认 '0.0.0.0'（局域网可访问）。 */
  host?: string
  /** 同时追加写入的文件（JSON Lines）。 */
  file?: string
  /** 每条日志的回调；默认打印到控制台。 */
  onLog?: (entry: { tag: string; data: unknown; t: number }) => void
}

/**
 * 局域网日志服务：接收小游戏（`saplingWechat({ logUrl })`）发来的日志并打印。
 * 返回 Node 的 http.Server，用完调用 `close()`。
 */
export function startLogServer(options: LogServerOptions = {}): Server {
  const onLog =
    options.onLog ??
    ((e) => {
      const time = new Date(e.t).toISOString().slice(11, 23)
      console.log(`[${time}] ${e.tag.padEnd(5)} ${typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}`)
    })
  if (options.file) mkdirSync(resolve(options.file, '..'), { recursive: true })
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c: Buffer) => (body += c))
    req.on('end', () => {
      if (req.method === 'POST' && body) {
        try {
          const entry = JSON.parse(body) as { tag: string; data: unknown; t: number }
          if (entry.tag === 'snapshot') {
            // 截图：保存成 PNG，日志里只记录文件路径
            const { label, dataUrl } = entry.data as { label: string; dataUrl: string }
            const dir = options.file ? resolve(options.file, '..') : resolve('logs')
            mkdirSync(dir, { recursive: true })
            // 请求来自局域网，不可信：label 只保留字母数字和 - _，时间戳只取数字，最终路径必须在日志目录内
            const safeLabel = String(label).replace(/[^\w-]/g, '_').slice(0, 64) || 'snapshot'
            const file = join(dir, `${safeLabel}-${Number(entry.t) || Date.now()}.png`)
            if (!file.startsWith(dir + sep)) throw new Error('invalid snapshot path')
            writeFileSync(file, Buffer.from(dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64'))
            entry.data = { label: safeLabel, file }
          }
          if (options.file) appendFileSync(options.file, JSON.stringify(entry) + '\n')
          onLog(entry)
        } catch {
          // 忽略无效的请求
        }
      }
      res.end('ok')
    })
  })
  server.listen(options.port ?? 7777, options.host ?? '0.0.0.0')
  return server
}
