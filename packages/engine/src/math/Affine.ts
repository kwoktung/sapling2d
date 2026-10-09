/**
 * 可变的 2D 仿射矩阵，字段含义同 `Transform2D`（x' = a·x + c·y + tx，y' = b·x + d·y + ty）。
 * 每帧都跑的路径用它在复用的对象上计算，不分配内存；Pixi 的 `Matrix` 结构上也满足这个接口。
 * 引擎内部用，不导出给游戏。
 */
export interface Affine {
  a: number
  b: number
  c: number
  d: number
  tx: number
  ty: number
}

export function identityAffine(): Affine {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
}

/** 把 `m` 的逆写进 `out`（可以是同一个对象）。不可逆（行列式为 0）时返回 false，`out` 不变。 */
export function invertAffine(m: Affine, out: Affine): boolean {
  const { a, b, c, d, tx, ty } = m
  const det = a * d - b * c
  if (det === 0) return false
  out.a = d / det
  out.b = -b / det
  out.c = -c / det
  out.d = a / det
  out.tx = (c * ty - d * tx) / det
  out.ty = (b * tx - a * ty) / det
  return true
}
