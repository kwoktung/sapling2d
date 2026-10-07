/** 缓动函数：输入 0–1 的进度，输出插值比例（可以超出 0–1，例如回弹）。 */
export type EaseFn = (t: number) => number

const c1 = 1.70158
const c2 = c1 * 1.525
const c3 = c1 + 1
const c4 = (2 * Math.PI) / 3

function bounceOut(t: number): number {
  const n1 = 7.5625
  const d1 = 2.75
  if (t < 1 / d1) return n1 * t * t
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375
  return n1 * (t -= 2.625 / d1) * t + 0.984375
}

/**
 * 常用缓动曲线。In 是先慢后快，Out 是先快后慢，InOut 是两头慢。
 *
 * ```ts
 * this.createTween().to(fruit, { scale: v(1.2, 1.2) }, 0.15, Ease.BackOut)
 * ```
 */
export const Ease = {
  Linear: (t) => t,
  QuadIn: (t) => t * t,
  QuadOut: (t) => 1 - (1 - t) * (1 - t),
  QuadInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  CubicIn: (t) => t * t * t,
  CubicOut: (t) => 1 - (1 - t) ** 3,
  CubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  SineIn: (t) => 1 - Math.cos((t * Math.PI) / 2),
  SineOut: (t) => Math.sin((t * Math.PI) / 2),
  SineInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  BackIn: (t) => c3 * t * t * t - c1 * t * t,
  BackOut: (t) => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2,
  BackInOut: (t) => (t < 0.5 ? ((2 * t) ** 2 * ((c2 + 1) * 2 * t - c2)) / 2 : ((2 * t - 2) ** 2 * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2),
  ElasticOut: (t) => (t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1),
  BounceOut: bounceOut,
  BounceIn: (t) => 1 - bounceOut(1 - t),
} satisfies Record<string, EaseFn>
