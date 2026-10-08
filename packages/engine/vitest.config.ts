import { defineConfig } from 'vitest/config'

// 基准测试（bench/）很慢，不进入普通的 `pnpm test`；用 `pnpm bench:physics[:jitless]` / `pnpm bench:bullets[:jitless]` 单独运行。
const bench = process.env.SAPLING_BENCH === '1'

export default defineConfig({
  test: {
    include: bench ? ['bench/**/*.test.ts'] : ['test/**/*.test.ts', 'docs/examples/**/*.test.ts'],
    // 基准的结果通过 console 输出，测试通过时也要显示
    ...(bench ? { silent: false } : {}),
    // 无 JIT 模式：近似 iOS 小游戏（见 spikes/wechat/REPORT.md 第 8 节）
    execArgv: process.env.SAPLING_JITLESS === '1' ? ['--jitless'] : [],
  },
})
