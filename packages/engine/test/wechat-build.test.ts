import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, createLogger } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { saplingWechat } from 'sapling2d/vite'
import { _createClock } from '../src/platform/wechat/clock'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

describe('saplingWechat', () => {
  let dir = ''
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))

  function fixture(main: string) {
    dir = mkdtempSync(join(tmpdir(), 'sapling-wechat-'))
    mkdirSync(join(dir, 'src'))
    mkdirSync(join(dir, 'public', 'assets'), { recursive: true })
    writeFileSync(join(dir, 'public', 'assets', 'fruit.png'), 'png')
    writeFileSync(join(dir, 'src', 'main.ts'), main)
    return (opts: { release?: boolean; logUrl?: string | null; warnings?: string[] } = {}) =>
      build({
        root: dir,
        logLevel: opts.warnings ? 'warn' : 'silent',
        ...(opts.warnings ? { customLogger: { ...createLogger('silent'), warn: (msg: string) => opts.warnings!.push(msg), warnOnce: (msg: string) => opts.warnings!.push(msg) } } : {}),
        // 临时目录不在工作区里：把 sapling2d 指向源码
        resolve: {
          alias: [
            { find: /^sapling2d$/, replacement: join(SRC, 'index.ts') },
            { find: /^sapling2d\/wechat-polyfills$/, replacement: join(SRC, 'platform', 'wechat', 'polyfills.ts') },
          ],
        },
        plugins: [saplingWechat({ entry: 'src/main.ts', appid: 'wx-test', orientation: 'landscape', release: opts.release ?? false, logUrl: opts.logUrl ?? null })],
      })
  }

  const read = (f: string) => readFileSync(join(dir, 'dist-wechat', f), 'utf8')

  it('产出单个 CommonJS 的 game.js、game.json、project.config.json，并拷贝资源', async () => {
    const run = fixture("import { v } from 'sapling2d'\nconsole.log(v(1, 2).toString())")
    await run()
    const js = read('game.js')
    expect(js).not.toMatch(/^\s*(import|export)\s/m) // 不是 ESM
    expect(js).toContain('__saplingLog') // 启动代码在最前面
    expect(js.indexOf('__saplingLog')).toBeLessThan(js.indexOf('Vector2'))
    expect(js).toContain('sourceMappingURL=data:') // 开发构建：内联 sourcemap
    expect(JSON.parse(read('game.json'))).toEqual({ deviceOrientation: 'landscape', showStatusBar: false, iOSHighPerformance: true })
    const project = JSON.parse(read('project.config.json'))
    expect(project.appid).toBe('wx-test')
    expect(project.compileType).toBe('game')
    expect(project.setting.urlCheck).toBe(true)
    expect(existsSync(join(dir, 'dist-wechat', 'assets', 'fruit.png'))).toBe(true)
  })

  it('资源里有 Tiled 自己的扩展名（.tmj / .tsj）时警告：小游戏代码包可能不收', async () => {
    const run = fixture("import { v } from 'sapling2d'\nconsole.log(v(1, 2).toString())")
    mkdirSync(join(dir, 'public', 'assets', 'levels'))
    writeFileSync(join(dir, 'public', 'assets', 'levels', '1-1.tmj'), '{}')
    const warnings: string[] = []
    await run({ warnings })
    expect(warnings.join('\n')).toMatch(/1-1\.tmj: Tiled files with these extensions may be left out of the mini game package; save maps and tilesets as \.json/)
  })

  it('运行环境补丁在游戏入口之前执行（虚拟入口：先 wechat-polyfills，再游戏代码）', async () => {
    const run = fixture("console.log('GAME_ENTRY_MARKER')")
    await run()
    const js = read('game.js')
    const polyfill = js.indexOf('wx.createCanvas()')
    expect(polyfill).toBeGreaterThan(-1)
    expect(polyfill).toBeLessThan(js.indexOf('GAME_ENTRY_MARKER'))
  })

  it('发布构建：压缩、不带 sourcemap；配置日志服务时关闭域名校验并把地址写进启动代码', async () => {
    const run = fixture("console.log('hello')")
    await run({ release: true, logUrl: 'http://10.0.0.2:7777/log' })
    const js = read('game.js')
    expect(js).not.toContain('sourceMappingURL')
    expect(js).toContain('http://10.0.0.2:7777/log')
    expect(JSON.parse(read('project.config.json')).setting.urlCheck).toBe(false)
  })

  it('产物里出现 eval / new Function / 动态 import 时构建失败', async () => {
    const run = fixture("const f = new Function('return 1'); console.log(f(), eval('2'))")
    await expect(run()).rejects.toThrow(/eval\(.*new Function\(|new Function\(|eval\(/)
  })
})

describe('WeChat 时钟', () => {
  it('真机（微秒、自纪元起）：按数量级判断，换算成毫秒', () => {
    let us = 1_791_345_484_883_330
    let ms = 1_791_345_484_883
    const now = _createClock({ now: () => us }, () => ms)
    const t0 = now()
    us += 16_000
    ms += 16
    expect(now() - t0).toBeCloseTo(16)
  })

  it('模拟器（毫秒、自启动起）：不换算', () => {
    let p = 4401.7
    let ms = 1_791_345_000_000
    const now = _createClock({ now: () => p }, () => ms)
    const t0 = now()
    p += 16
    ms += 16
    expect(now() - t0).toBeCloseTo(16)
  })

  it('数量级判断错了时，约 1 秒后按 Date.now() 纠正，且时间保持连续', () => {
    let p = 5_000_000 // 微秒但数值很小：会被误判为毫秒
    let ms = 0
    const now = _createClock({ now: () => p }, () => ms)
    p += 500_000
    ms += 500
    expect(now()).toBeGreaterThan(5_000_000) // 误判：按毫秒
    p += 600_000
    ms += 600
    const corrected = now() // 超过 1 秒：纠正
    p += 16_000
    ms += 16
    expect(now() - corrected).toBeCloseTo(16)
  })
})
