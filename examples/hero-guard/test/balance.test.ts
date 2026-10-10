import { describe, expect, it } from 'vitest'
import { describe as describeRun, median, simulate, type SimResult, type Strategy } from './sim'

/**
 * 平衡测试：固定种子各跑 9 局（约 10 秒）。改了英雄、怪物、波次、技能的数值之后看它还过不过。
 * `pnpm balance` 打印每局的详细结果（漏怪的波次、阵亡次数、大招次数、用时）。
 */
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const REPORT = !!process.env.BALANCE_REPORT

async function runAll(strategy: Strategy): Promise<SimResult[]> {
  const out: SimResult[] = []
  for (const seed of SEEDS) {
    const r = await simulate(seed, strategy)
    if (REPORT) console.log(describeRun(r))
    out.push(r)
  }
  return out
}

describe('平衡', () => {
  it('新手（随机选英雄和升级、不放大招）：中位数至少打到第 8 波，多数局会输', async () => {
    const runs = await runAll('novice')
    expect(median(runs.map((r) => r.wave))).toBeGreaterThanOrEqual(8)
    expect(runs.filter((r) => r.won).length).toBeLessThanOrEqual(SEEDS.length / 2)
  }, 120000)

  it('合理策略（升级有取舍、大招放到怪多的地方）：至少 2/3 的局通关，剩下的命中位数不超过一半多一点', async () => {
    const runs = await runAll('reasonable')
    expect(runs.filter((r) => r.won).length).toBeGreaterThanOrEqual((SEEDS.length * 2) / 3)
    expect(median(runs.map((r) => r.lives))).toBeLessThanOrEqual(12)
    // 一局 10–15 分钟（spec）
    expect(median(runs.map((r) => r.time))).toBeGreaterThan(9 * 60)
    expect(median(runs.map((r) => r.time))).toBeLessThan(15 * 60)
  }, 120000)
})
