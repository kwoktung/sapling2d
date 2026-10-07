import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { buildLlms } from '../scripts/build-llms'

it('llms.txt 与 docs/examples 同步（不同步时运行 pnpm docs）', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  expect(readFileSync(join(root, 'llms.txt'), 'utf8')).toBe(buildLlms(root))
})
