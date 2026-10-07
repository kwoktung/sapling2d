import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, ViteDevServer } from 'vite'

export interface SaplingPluginOptions {
  /**
   * 资源目录（相对于 Vite 的 root）。默认 `public/assets`：Vite 会把 public/ 原样发布，
   * 页面上的地址是 `assets/<path>`，与 `startGame` 的默认 `assetsBaseUrl` 一致。
   * 游戏代码里的 `tex('fruit.png')` 对应 `<root>/public/assets/fruit.png`。
   */
  assetsDir?: string
}

/** 匹配 tex('...') / sfx("...") / music(`...`) 的字面量路径（模板字符串里有 ${} 的跳过）。 */
const ASSET_CALL = /\b(tex|sfx|music)\(\s*(['"`])((?:(?!\2)[^\\\n$]|\\.)+)\2\s*\)/g
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/

export interface AssetReference {
  fn: 'tex' | 'sfx' | 'music'
  path: string
  /** 1 起始的行号和 0 起始的列号（与 Rollup 的 loc 一致）。 */
  line: number
  column: number
}

/** sapling2d 包自身的源码目录：不检查（文档注释里有示例路径）。 */
const ENGINE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 找出源码中所有字面量资源路径（注释里的不算）。 */
export function findAssetReferences(code: string): AssetReference[] {
  const refs: AssetReference[] = []
  for (const m of stripComments(code).matchAll(ASSET_CALL)) {
    const before = code.slice(0, m.index)
    const line = before.split('\n').length
    const column = m.index - (before.lastIndexOf('\n') + 1)
    refs.push({ fn: m[1] as AssetReference['fn'], path: m[3]!, line, column })
  }
  return refs
}

/**
 * sapling2d 的 Vite 插件：在构建和开发时检查 `tex()` / `sfx()` / `music()` 引用的资源文件是否存在。
 * 文件缺失时构建失败、开发服务器显示错误浮层，并指出文件、行列和最相近的现有文件名。
 *
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite'
 * import { sapling } from 'sapling2d/vite'
 * export default defineConfig({ plugins: [sapling()] })
 * ```
 */
export function sapling(options: SaplingPluginOptions = {}): Plugin {
  let assetsRoot = ''
  let server: ViteDevServer | null = null
  /** 资源文件的绝对路径 → 引用它的模块 */
  const dependents = new Map<string, Set<string>>()

  return {
    name: 'sapling2d',
    enforce: 'pre',

    configResolved(config) {
      assetsRoot = resolve(config.root, options.assetsDir ?? join('public', 'assets'))
    },

    configureServer(s) {
      server = s
      // 资源文件新增或删除时，让引用它的模块重新检查
      const onChange = (file: string) => {
        const ids = dependents.get(resolve(file))
        if (!ids || !server) return
        for (const id of ids) {
          const mod = server.moduleGraph.getModuleById(id)
          if (mod) server.moduleGraph.invalidateModule(mod)
        }
        server.ws.send({ type: 'full-reload' })
      }
      s.watcher.add(assetsRoot)
      s.watcher.on('add', onChange)
      s.watcher.on('unlink', onChange)
    },

    transform(code, id) {
      const file = id.split('?')[0]!
      if (!SOURCE_FILE.test(file) || file.includes(`${sep}node_modules${sep}`) || file.startsWith(ENGINE_ROOT + sep)) return null
      if (!/\b(?:tex|sfx|music)\(/.test(code)) return null
      for (const ref of findAssetReferences(code)) {
        const loc = { line: ref.line, column: ref.column }
        const abs = resolve(assetsRoot, ref.path)
        let set = dependents.get(abs)
        if (!set) dependents.set(abs, (set = new Set()))
        set.add(id)
        if (abs !== assetsRoot && !abs.startsWith(assetsRoot + sep)) {
          this.error({ message: `${ref.fn}('${ref.path}') points outside the assets directory (${relative(process.cwd(), assetsRoot)}).`, id, loc })
        }
        if (!existsSync(abs) || !statSync(abs).isFile()) {
          const hint = closestAsset(assetsRoot, ref.path)
          this.error({
            message:
              `Asset not found: ${ref.fn}('${ref.path}') → ${relative(process.cwd(), abs)}` +
              (hint ? `. Did you mean '${hint}'?` : `. Put the file in ${relative(process.cwd(), assetsRoot)}/.`),
            id,
            loc,
          })
        }
      }
      return null
    },
  }
}

/**
 * 把注释替换成空格（保留换行，行列号不变）。识别字符串和模板字符串，
 * 所以 `'http://...'` 里的 // 不会被当成注释。
 */
function stripComments(code: string): string {
  let out = ''
  let i = 0
  while (i < code.length) {
    const c = code[i]!
    const next = code[i + 1]
    if (c === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') {
        out += ' '
        i++
      }
    } else if (c === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2)
      const stop = end === -1 ? code.length : end + 2
      for (; i < stop; i++) out += code[i] === '\n' ? '\n' : ' '
    } else if (c === "'" || c === '"' || c === '`') {
      out += c
      i++
      while (i < code.length && code[i] !== c) {
        if (code[i] === '\\') {
          out += code[i]! + (code[i + 1] ?? '')
          i += 2
        } else {
          out += code[i]
          i++
        }
      }
      if (i < code.length) out += code[i++]
    } else {
      out += c
      i++
    }
  }
  return out
}

/** 资源目录里与 `wanted` 最相近的文件（编辑距离），用于报错提示。 */
function closestAsset(root: string, wanted: string): string | null {
  const files = listFiles(root).map((f) => relative(root, f).split(sep).join('/'))
  let best: string | null = null
  let bestScore = Infinity
  for (const f of files) {
    const d = editDistance(f.toLowerCase(), wanted.toLowerCase())
    if (d < bestScore) {
      bestScore = d
      best = f
    }
  }
  // 差得太远的建议没有意义
  return best !== null && bestScore <= Math.max(3, Math.floor(wanted.length / 3)) ? best : null
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(p))
    else out.push(p)
  }
  return out
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]!
}

// Vite 配置由 Node 原生加载：相对导入必须带 .ts 扩展名
export { saplingWechat, startLogServer, type SaplingWechatOptions, type LogServerOptions } from './wechat.ts'
