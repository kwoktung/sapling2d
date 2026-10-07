/**
 * 单调时钟（毫秒）。`wx.getPerformance().now()` 在真机上是微秒（自纪元起，约 1.8e15），
 * 在开发者工具模拟器里是毫秒（自启动起）——见 spikes/wechat/REPORT.md。
 * 先按数量级判断单位；运行约 1 秒后再与 Date.now() 对比校验一次，判断错了就纠正（只会发生一次）。
 */
/** @internal 导出供测试使用。 */
export function _createClock(perf: { now(): number }, dateNow: () => number): () => number {
  const p0 = perf.now()
  const d0 = dateNow()
  let divisor = p0 > 1e13 ? 1000 : 1
  let offset = 0
  let verified = false
  return () => {
    const raw = perf.now()
    if (!verified) {
      const elapsedDate = dateNow() - d0
      if (elapsedDate >= 1000) {
        verified = true
        const ratio = (raw - p0) / elapsedDate
        const actual = ratio > 100 ? 1000 : 1
        if (actual !== divisor) {
          // 保持时间连续：换单位时调整偏移
          const before = raw / divisor + offset
          divisor = actual
          offset = before - raw / divisor
          console.warn(`[sapling2d] wx.getPerformance().now() unit corrected (ratio ${ratio.toFixed(1)})`)
        }
      }
    }
    return raw / divisor + offset
  }
}
