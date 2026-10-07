// 生成 llms.txt：把 docs/llms.template.md 里的 <!-- example:名字 --> 和 <!-- example:名字#test -->
// 替换成 docs/examples/名字.test.ts 中对应 #region 的代码。示例本身是测试，所以文档里的代码一定能跑。
//
// 运行：pnpm docs（node 直接执行本文件）。test/llms.test.ts 会检查 llms.txt 是否与示例同步。
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 取出 `// #region 名字` 与 `// #endregion` 之间的代码，去掉公共缩进。 */
export function extractRegion(source: string, region: string, file: string): string {
  const lines = source.split('\n')
  const start = lines.findIndex((l) => l.trim() === `// #region ${region}`)
  if (start === -1) throw new Error(`${file}: no "// #region ${region}"`)
  const end = lines.findIndex((l, i) => i > start && l.trim() === '// #endregion')
  if (end === -1) throw new Error(`${file}: "// #region ${region}" is not closed`)
  const body = lines.slice(start + 1, end)
  const indent = Math.min(...body.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length))
  return body.map((l) => l.slice(indent)).join('\n').trimEnd()
}

export function buildLlms(root = ROOT): string {
  const template = readFileSync(join(root, 'docs', 'llms.template.md'), 'utf8')
  return template.replace(/<!-- example:([\w-]+)(?:#(\w+))? -->/g, (_, name: string, region = 'example') => {
    const file = join('docs', 'examples', `${name}.test.ts`)
    const code = extractRegion(readFileSync(join(root, file), 'utf8'), region, file)
    return '```ts\n' + code + '\n```'
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(ROOT, 'llms.txt'), buildLlms())
  console.log('llms.txt updated')
}
