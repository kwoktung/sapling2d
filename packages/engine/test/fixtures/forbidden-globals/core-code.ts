// 测试夹具：模拟核心代码误用平台全局对象。tsconfig 与 src/ 相同（lib 只有 ES2022），这三行都应该报错。
export const a = window.innerWidth
export const b = document.body
export const c = wx.getWindowInfo()
