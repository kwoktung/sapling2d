import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { findAssetReferences, sapling } from 'sapling2d/vite'

describe('findAssetReferences', () => {
  it('找出 tex / sfx / music 的字面量路径及行列号', () => {
    const code = ["const a = tex('fruit.png')", 'class S {', '  static assets = { pop: sfx("sfx/pop.mp3"), bgm: music(`bgm.mp3`) }', '}'].join('\n')
    expect(findAssetReferences(code)).toEqual([
      { fn: 'tex', path: 'fruit.png', line: 1, column: 10 },
      { fn: 'sfx', path: 'sfx/pop.mp3', line: 3, column: 25 },
      { fn: 'music', path: 'bgm.mp3', line: 3, column: 50 },
    ])
  })

  it('sheet / atlas：检查第一个参数（图片路径）', () => {
    const code = "sheet('boom.png', { columns: 4, rows: 2 }); atlas(\"ui/sprites.png\", data); sheet(path, grid)"
    expect(findAssetReferences(code)).toEqual([
      { fn: 'sheet', path: 'boom.png', line: 1, column: 0 },
      { fn: 'atlas', path: 'ui/sprites.png', line: 1, column: 44 },
    ])
  })

  it('tileset：检查第一个参数（图集图片路径）', () => {
    expect(findAssetReferences("const T = tileset('tiles/ground.png', { tileSize: 16 })")).toEqual([{ fn: 'tileset', path: 'tiles/ground.png', line: 1, column: 10 }])
  })

  it('忽略注释里的示例；字符串里的 // 不影响后面的识别', () => {
    const code = ["/** 用法：tex('doc.png') */", "// sfx('commented.mp3')", "const u = 'http://cdn/x'; tex('real.png')"].join('\n')
    expect(findAssetReferences(code)).toEqual([{ fn: 'tex', path: 'real.png', line: 3, column: 26 }])
  })

  it('跳过动态路径（变量、带 ${} 的模板字符串）和其他同名调用', () => {
    const code = 'tex(name); tex(`fruit-${level}.png`); context.tex2("a"); retex("b.png")'
    expect(findAssetReferences(code)).toEqual([])
  })
})

describe('vite build', () => {
  let dir = ''
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))

  function fixture(main: string) {
    dir = mkdtempSync(join(tmpdir(), 'sapling-vite-'))
    mkdirSync(join(dir, 'public', 'assets', 'sfx'), { recursive: true })
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'public', 'assets', 'fruit.png'), '')
    writeFileSync(join(dir, 'public', 'assets', 'sfx', 'pop.mp3'), '')
    writeFileSync(join(dir, 'index.html'), '<script type="module" src="/src/main.ts"></script>')
    writeFileSync(join(dir, 'src', 'main.ts'), main)
    return () => build({ root: dir, logLevel: 'silent', plugins: [sapling()], build: { write: false } })
  }

  const prelude = 'const tex = (p: string) => p; const sfx = (p: string) => p\n'

  it('资源都存在时构建成功', async () => {
    const run = fixture(prelude + "console.log(tex('fruit.png'), sfx('sfx/pop.mp3'))")
    await expect(run()).resolves.toBeDefined()
  })

  it('资源缺失时构建失败，报错指出文件、行列和最相近的文件名', async () => {
    const run = fixture(prelude + "console.log(tex('frut.png'))")
    // Vite 8（Rolldown）把插件错误包在 errors 数组里；消息里带有 文件:行:列
    const err = (await run().catch((e: unknown) => e)) as Error & { errors?: { id: string; loc: { line: number; column: number } }[] }
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain("Asset not found: tex('frut.png')")
    expect(err.message).toContain("Did you mean 'fruit.png'?")
    expect(err.message).toMatch(/src[/\\]main\.ts:2:12/)
    expect(err.errors?.[0]?.id).toMatch(/src[/\\]main\.ts$/)
    expect(err.errors?.[0]?.loc).toEqual({ line: 2, column: 12 })
  })

  it('路径跑出资源目录时报错', async () => {
    const run = fixture(prelude + "console.log(tex('../../secret.png'))")
    await expect(run()).rejects.toThrow(/outside the assets directory/)
  })
})
