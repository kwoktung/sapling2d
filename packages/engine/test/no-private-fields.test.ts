import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

/** `#name` 成员的声明（行首，可带修饰符）或访问（`.#name`）。字符串里的 `#`（颜色、帧路径）不会匹配。 */
const PRIVATE_NAME = /\.#[A-Za-z_$]|^\s*(?:(?:static|readonly|async|override|get|set)\s+)*#[A-Za-z_$]/m

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []
  })
}

// 小游戏构建的目标是 ES2017，#private 会被编译成 WeakMap 辅助函数，iOS 没有 JIT 时慢 2–3 倍（ADR 0006）
it('引擎源码不使用 #private 成员（用 TS 的 private _name）', () => {
  const offenders = files(src)
    .map((f) => ({ f, line: readFileSync(f, 'utf8').split('\n').findIndex((l) => PRIVATE_NAME.test(l)) }))
    .filter((x) => x.line >= 0)
    .map((x) => `${relative(src, x.f)}:${x.line + 1}`)
  expect(offenders).toEqual([])
})
