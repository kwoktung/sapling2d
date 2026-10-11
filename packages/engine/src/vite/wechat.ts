import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, type Dirent } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { dirname, join, relative, resolve, sep } from 'node:path'
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
  /** 资源目录（相对于 root），会被拷贝进小游戏工程。默认 `public/assets`。 */
  assetsDir?: string
  /**
   * 哪些资源放在主包（启动页和 startGame 完成前用到的资源），其余放进资源分包，启动页显示后再下载。
   * glob（相对于资源目录，支持 `*`、`**`、`?`）或函数。默认 `'boot/**'`。
   * 主包上限 4 MB（含 game.js），所有包合计 30 MB。
   */
  mainAssets?: string | string[] | ((path: string) => boolean)
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

const VIRTUAL_ENTRY = '__sapling2d_wechat_entry__.js'
const RESOLVED_VIRTUAL_ENTRY = '\0' + VIRTUAL_ENTRY
/** 资源清单（哪些在主包）：在虚拟入口里最先导入，WechatPlatform 创建时读 `GameGlobal.__saplingAssets`。 */
const VIRTUAL_MANIFEST = '__sapling2d_wechat_assets__.js'
const RESOLVED_VIRTUAL_MANIFEST = '\0' + VIRTUAL_MANIFEST

/** 主包资源的目录；资源分包的名字和目录（目录里必须有 game.js，见 spikes/wechat-subpackage/REPORT.md）。 */
const MAIN_ASSETS_DIR = 'assets'
const SUBPACKAGE_NAME = 'assets'
const SUBPACKAGE_DIR = 'assets-sub'

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
  let assetsRoot = ''
  const isMain = mainAssetsMatcher(options.mainAssets ?? 'boot/**')
  /** 写进 game.js 的主包资源清单（构建开始时的资源目录）。 */
  let injectedMain: string[] = []
  let logger: { info(msg: string): void } | null = null

  return {
    name: 'sapling2d:wechat',
    config(config) {
      root = resolve(config.root ?? process.cwd())
      outDir = resolve(root, options.outDir ?? 'dist-wechat')
      assetsRoot = resolve(root, options.assetsDir ?? join('public', 'assets'))
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
          // 入口是一个虚拟模块：先导入运行环境补丁，再导入游戏入口（见 resolveId / load）
          lib: { entry: VIRTUAL_ENTRY, formats: ['cjs'], fileName: () => 'game.js' },
          rolldownOptions: { output: { banner: bootBanner(logUrl), inlineDynamicImports: true } },
        },
      }
    },

    configResolved(config) {
      logger = config.logger
    },

    /**
     * 虚拟入口：`import 'sapling2d/wechat-polyfills'` 一定排在游戏入口之前。
     * 同一个 bundle 里模块按导入顺序执行，所以补丁（Intl、navigator、canvas 等）总是先于任何 pixi.js 模块运行——
     * 不依赖 sapling2d 自身的构建产物里 chunk 的顺序（外部的 pixi.js import 会被提升到补丁代码前面）。
     */
    resolveId(id) {
      if (id === VIRTUAL_MANIFEST) return RESOLVED_VIRTUAL_MANIFEST
      // 库模式会把入口当作相对 root 的路径解析：按文件名匹配
      return id === VIRTUAL_ENTRY || id.endsWith('/' + VIRTUAL_ENTRY) ? RESOLVED_VIRTUAL_ENTRY : null
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MANIFEST) {
        const plan = planAssets(assetsRoot, isMain)
        injectedMain = plan.main
        const manifest = { main: plan.main, subpackage: plan.sub.length ? { name: SUBPACKAGE_NAME, root: `${SUBPACKAGE_DIR}/` } : null }
        return `GameGlobal.__saplingAssets = JSON.parse(${JSON.stringify(JSON.stringify(manifest))})\n`
      }
      if (id !== RESOLVED_VIRTUAL_ENTRY) return null
      return `import '${VIRTUAL_MANIFEST}'\nimport 'sapling2d/wechat-polyfills'\nimport ${JSON.stringify(resolve(root, options.entry))}\n`
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
      const plan = planAssets(assetsRoot, isMain)
      if (plan.main.join('\n') !== injectedMain.join('\n')) {
        this.warn('main-package assets changed since the build started (files added to or removed from boot/): restart the build so game.js gets the new list.')
      }
      writeJson(join(outDir, 'game.json'), {
        deviceOrientation: options.orientation ?? 'portrait',
        showStatusBar: false,
        iOSHighPerformance: options.iOSHighPerformance ?? true,
        ...(plan.sub.length ? { subpackages: [{ name: SUBPACKAGE_NAME, root: `${SUBPACKAGE_DIR}/` }] } : {}),
      })
      writeJson(join(outDir, 'project.config.json'), {
        appid: options.appid ?? process.env.WX_APPID ?? 'touristappid',
        projectname: options.projectName ?? 'sapling2d-game',
        compileType: 'game',
        libVersion: '3.0.0',
        // urlCheck: false 才能在开发时访问局域网日志服务。
        // 不让开发者工具再转译（es6 / enhance）：game.js 已经是 ES2017，转成 ES5 后上传体积会变成约 1.1–2.1 倍、无法预估（实测见 checkPackageSize）
        setting: { es6: false, enhance: false, minified: false, urlCheck: logUrl === null },
      })
      // 每次都重新拷贝：删掉的资源不能留在包里
      rmSync(join(outDir, MAIN_ASSETS_DIR), { recursive: true, force: true })
      rmSync(join(outDir, SUBPACKAGE_DIR), { recursive: true, force: true })
      for (const f of plan.main) copyAsset(assetsRoot, f, join(outDir, MAIN_ASSETS_DIR))
      for (const f of plan.sub) copyAsset(assetsRoot, f, join(outDir, SUBPACKAGE_DIR))
      // 分包目录里必须有 game.js（入口），分包下载完时执行
      if (plan.sub.length) writeFileSync(join(outDir, SUBPACKAGE_DIR, 'game.js'), '// sapling2d asset subpackage\n')
      // 小游戏的代码包只收一部分扩展名：Tiled 自己的扩展名可能在上传 / 预览时被丢掉，真机上读不到关卡
      const tiled = [...plan.main, ...plan.sub].filter((f) => /\.(tmj|tsj|tmx|tsx)$/i.test(f))
      if (tiled.length) {
        this.warn(`assets ${tiled.slice(0, 5).join(', ')}${tiled.length > 5 ? ' …' : ''}: Tiled files with these extensions may be left out of the mini game package; save maps and tilesets as .json.`)
      }
      const report = checkPackageSize({
        gameJs: Buffer.byteLength(code),
        main: plan.main.map((f) => ({ file: f, size: statSync(join(assetsRoot, f)).size })),
        sub: plan.sub.reduce((sum, f) => sum + statSync(join(assetsRoot, f)).size, 0),
        release,
      })
      logger?.info(report.summary)
      for (const w of report.warnings) this.warn(w)
      if (report.error) this.error(report.error)
    },
  }
}

/** 主包上限（含 game.js）和所有包合计的上限（官方文档，见 spikes/wechat-subpackage/REPORT.md）。 */
export const MAIN_PACKAGE_LIMIT = 4 * 1024 * 1024
export const TOTAL_PACKAGE_LIMIT = 30 * 1024 * 1024
/** 超过上限的这个比例时警告。 */
const WARN_RATIO = 0.8

export interface PackageSizeReport {
  /** 一行汇总（构建时打印）。 */
  summary: string
  warnings: string[]
  /** 发布构建超限时的错误信息。 */
  error: string | null
}

/**
 * 包体大小和上限比较。主包 = game.js + 主包资源；分包 = 分包资源。
 * 生成的 project.config.json 关掉了开发者工具的转译，上传后的大小和文件大小一致（`cli preview --info-output` 实测）；
 * 转译打开时（es6 / enhance）game.js 会变成约 1.1–2.1 倍。
 * 发布构建超限时报错、接近时警告；开发构建（内联 sourcemap，只在模拟器里跑）只汇总。
 */
export function checkPackageSize(input: { gameJs: number; main: { file: string; size: number }[]; sub: number; release: boolean }): PackageSizeReport {
  const js = input.gameJs
  const main = js + input.main.reduce((sum, f) => sum + f.size, 0)
  const total = main + input.sub
  const summary =
    `wechat package: main ${mb(main)} / ${mb(MAIN_PACKAGE_LIMIT)} (game.js ${mb(js)}), ` +
    `asset subpackage ${mb(input.sub)}, total ${mb(total)} / ${mb(TOTAL_PACKAGE_LIMIT)}` +
    (input.release ? '' : ' — dev build with inline sourcemap: simulator only')
  const warnings: string[] = []
  if (!input.release) return { summary, warnings, error: null }
  const largest = [{ file: 'game.js', size: js }, ...input.main.map((f) => ({ file: `assets/${f.file}`, size: f.size }))]
    .sort((a, b) => b.size - a.size)
    .slice(0, 5)
    .map((f) => `${f.file} ${mb(f.size)}`)
    .join(', ')
  const errors: string[] = []
  if (main > MAIN_PACKAGE_LIMIT) {
    errors.push(`main package is ${mb(main)}, over the ${mb(MAIN_PACKAGE_LIMIT)} limit. Largest: ${largest}. Move assets out of public/assets/boot/ (or narrow saplingWechat({ mainAssets })) so they go into the asset subpackage.`)
  } else if (main > MAIN_PACKAGE_LIMIT * WARN_RATIO) {
    warnings.push(`main package is ${mb(main)}, close to the ${mb(MAIN_PACKAGE_LIMIT)} limit. Largest: ${largest}.`)
  }
  if (total > TOTAL_PACKAGE_LIMIT) {
    errors.push(`all packages together are ${mb(total)}, over the ${mb(TOTAL_PACKAGE_LIMIT)} limit: shrink assets or serve some of them from a CDN.`)
  } else if (total > TOTAL_PACKAGE_LIMIT * WARN_RATIO) {
    warnings.push(`all packages together are ${mb(total)}, close to the ${mb(TOTAL_PACKAGE_LIMIT)} limit.`)
  }
  return { summary, warnings, error: errors.length ? `[sapling2d:wechat] ${errors.join(' ')}` : null }
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** 资源目录里的文件（`/` 分隔的相对路径）分到主包和分包。资源目录不存在时都为空。 */
export function planAssets(assetsRoot: string, isMain: (path: string) => boolean): { main: string[]; sub: string[] } {
  const main: string[] = []
  const sub: string[] = []
  if (!existsSync(assetsRoot)) return { main, sub }
  const files = (readdirSync(assetsRoot, { recursive: true, withFileTypes: true }) as Dirent[])
    .filter((d) => d.isFile() && d.name !== '.DS_Store')
    .map((d) => relative(assetsRoot, join(d.parentPath, d.name)).split(sep).join('/'))
    .sort()
  for (const f of files) (isMain(f) ? main : sub).push(f)
  return { main, sub }
}

/** `mainAssets` 选项 → 判断函数。glob 支持 `**`（任意层目录）、`*`（不含 /）、`?`。 */
export function mainAssetsMatcher(option: string | string[] | ((path: string) => boolean)): (path: string) => boolean {
  if (typeof option === 'function') return option
  const res = (Array.isArray(option) ? option : [option]).map(globToRegExp)
  return (path) => res.some((re) => re.test(path))
}

function globToRegExp(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!
    if (c === '*' && glob[i + 1] === '*') {
      // `**/` 匹配零层或多层目录，末尾的 `**` 匹配剩下的一切
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?'
        i += 2
      } else {
        re += '.*'
        i += 1
      }
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

function copyAsset(assetsRoot: string, file: string, destDir: string): void {
  const dest = join(destDir, file)
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(join(assetsRoot, file), dest)
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
