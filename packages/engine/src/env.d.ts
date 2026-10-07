// 核心代码只用 ES2022 标准库，不引入 DOM 类型。console 不属于 ES 标准，但所有目标平台（浏览器、小游戏、Node）都有，
// 这里只声明引擎会用到的最小子集。
declare var console: {
  log(...data: unknown[]): void
  debug(...data: unknown[]): void
  warn(...data: unknown[]): void
  error(...data: unknown[]): void
}
