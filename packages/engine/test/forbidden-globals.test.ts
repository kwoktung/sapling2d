import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const tsc = join(dirname(createRequire(import.meta.url).resolve('typescript/package.json')), 'bin', 'tsc')

it('核心代码使用 window / document / wx 时类型检查报错', () => {
  let output = ''
  try {
    execFileSync(process.execPath, [tsc, '-p', join(here, 'fixtures/forbidden-globals/tsconfig.json')], { encoding: 'utf8' })
  } catch (e) {
    output = String((e as { stdout?: string }).stdout ?? '')
  }
  expect(output).toMatch(/Cannot find name 'window'/)
  expect(output).toMatch(/Cannot find name 'document'/)
  expect(output).toMatch(/Cannot find name 'wx'/)
}, 30_000)
