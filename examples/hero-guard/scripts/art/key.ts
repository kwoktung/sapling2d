/**
 * 色键抠图：去掉纯色背景、模型画在背景上的阴影，把边缘半透明的像素还原成原来的颜色（去掉背景色的“溢色”）。
 *
 * 判断一个像素“像不像背景”看它的色度（颜色减去灰度）和背景色色度的关系：
 * - `cos`：色相是否一致（色度向量夹角的余弦）；
 * - `s`：色度有多强（相对背景色的色度长度）。纯背景 s ≈ 1，背景上的阴影色相一样但更暗，s 约 0.4–0.7。
 *
 * 1. 泛洪找背景：从图的四边、以及“几乎就是背景色”的像素（cos > SEED_COS 且 s > SEED_S，例如弓和弓弦围住的那一块）开始，
 *    色相一致（cos > COS）且色度够强（s > FLOOD_S）的相连像素都是背景（包括阴影），完全透明。
 *    角色的深色描边色度很弱，挡住泛洪，所以角色身上颜色相近但不那么纯的像素（比如紫色衣服）不会被抠掉；
 *    角色身上真有这么纯的背景色时，这个素材换一种背景色。
 * 2. 抗锯齿边缘（描边和背景混合）：
 *    - 泛洪到、但紧挨着角色的那一圈：和旁边真正的背景比色度，透明度 = 1 − s / s旁边，再按旁边背景的颜色把前景色还原出来。
 *      纯背景上半覆盖的像素约 0.5；阴影边上的像素旁边也是同样暗的阴影，算出来约 0，照样去掉；
 *    - 没被泛洪到、但挨着背景的像素（色度弱，大多是描边）：透明度 = 1 − s，同样减掉背景的那部分；
 *    - 边缘一圈再去掉残留的背景色色度（去溢色）。
 * 3. 裁掉四周全透明的部分（留 2 像素）。
 */

export interface RawImage {
  data: Buffer | Uint8Array
  width: number
  height: number
}

const COS = 0.85
const FLOOD_S = 0.3
const SEED_COS = 0.95
const SEED_S = 0.7
const PAD = 2

export function parseHex(color: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(color)
  if (!m) throw new Error(`bad color "${color}" (expected #RRGGBB)`)
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** 抠图：输入 RGBA 原图，返回裁好边的 RGBA 图（`trim: false` 时不裁边，大小和原图一样：横排的帧要按格切开）。 */
export function chromaKey(img: RawImage, background: string, options: { trim?: boolean } = {}): RawImage {
  const { width: w, height: h } = img
  const src = img.data
  const [kr, kg, kb] = parseHex(background)
  const km = (kr + kg + kb) / 3
  const kx = kr - km
  const ky = kg - km
  const kz = kb - km
  const kLen = Math.hypot(kx, ky, kz)
  if (kLen < 30) throw new Error(`background ${background} is too gray to key out; use a saturated color`)

  // 每个像素的 cos 和 s
  const cosArr = new Float32Array(w * h)
  const sArr = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const r = src[i * 4]!
    const g = src[i * 4 + 1]!
    const b = src[i * 4 + 2]!
    const m = (r + g + b) / 3
    const dx = r - m
    const dy = g - m
    const dz = b - m
    const dLen = Math.hypot(dx, dy, dz)
    cosArr[i] = dLen > 1e-3 ? (dx * kx + dy * ky + dz * kz) / (dLen * kLen) : 0
    sArr[i] = dLen / kLen
  }

  // 1. 从四边泛洪出背景
  const bg = new Uint8Array(w * h)
  const stack: number[] = []
  const isBg = (i: number) => cosArr[i]! > COS && sArr[i]! > FLOOD_S
  const push = (i: number) => {
    if (!bg[i] && isBg(i)) {
      bg[i] = 1
      stack.push(i)
    }
  }
  for (let x = 0; x < w; x++) {
    push(x)
    push((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    push(y * w)
    push(y * w + w - 1)
  }
  for (let i = 0; i < w * h; i++) if (cosArr[i]! > SEED_COS && sArr[i]! > SEED_S) push(i)
  while (stack.length) {
    const i = stack.pop()!
    const x = i % w
    const y = (i - x) / w
    if (x > 0) push(i - 1)
    if (x < w - 1) push(i + 1)
    if (y > 0) push(i - w)
    if (y < h - 1) push(i + w)
  }

  // 2. 透明度和去溢色
  const out = new Uint8Array(w * h * 4)
  const isEdge = (i: number) => {
    const x = i % w
    const y = (i - x) / w
    return (x > 0 && !bg[i - 1]) || (x < w - 1 && !bg[i + 1]) || (y > 0 && !bg[i - w]) || (y < h - 1 && !bg[i + w])
  }
  for (let i = 0; i < w * h; i++) {
    if (!bg[i] || !isEdge(i)) continue
    // 泛洪到的边缘像素：找 2 像素内色度最强的背景像素当“旁边的背景”
    const x = i % w
    const y = (i - x) / w
    let ref = -1
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (bg[j] && !isEdge(j) && (ref < 0 || sArr[j]! > sArr[ref]!)) ref = j
      }
    }
    if (ref < 0) continue
    const a = Math.max(0, Math.min(1, 1 - sArr[i]! / sArr[ref]!))
    if (a < 0.08) continue
    const o = i * 4
    const r0 = ref * 4
    out[o] = clampByte((src[o]! - (1 - a) * src[r0]!) / a)
    out[o + 1] = clampByte((src[o + 1]! - (1 - a) * src[r0 + 1]!) / a)
    out[o + 2] = clampByte((src[o + 2]! - (1 - a) * src[r0 + 2]!) / a)
    out[o + 3] = Math.round(a * 255)
  }
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    if (bg[i]) continue // 背景：全透明（out 默认是 0），边缘一圈上面已经算过
    let r = src[o]!
    let g = src[o + 1]!
    let b = src[o + 2]!
    let a = 1
    if (touchesBackground(bg, i, w, h) && cosArr[i]! > COS) {
      // 抗锯齿边缘：颜色 = a·前景 + (1 − a)·背景，背景的那部分约等于色度强度
      a = Math.max(0, Math.min(1, 1 - sArr[i]!))
      if (a < 0.08) continue
      r = clampByte((r - (1 - a) * kr) / a)
      g = clampByte((g - (1 - a) * kg) / a)
      b = clampByte((b - (1 - a) * kb) / a)
    }
    if (touchesBackground(bg, i, w, h)) {
      // 边缘一圈：去掉朝背景色方向的残留色度
      const m = (r + g + b) / 3
      const along = ((r - m) * kx + (g - m) * ky + (b - m) * kz) / kLen
      if (along > 0) {
        r = clampByte(r - (along * kx) / kLen)
        g = clampByte(g - (along * ky) / kLen)
        b = clampByte(b - (along * kz) / kLen)
      }
    }
    out[o] = r
    out[o + 1] = g
    out[o + 2] = b
    out[o + 3] = Math.round(a * 255)
  }
  return options.trim === false ? { data: out, width: w, height: h } : trim({ data: out, width: w, height: h })
}

function touchesBackground(bg: Uint8Array, i: number, w: number, h: number): boolean {
  const x = i % w
  const y = (i - x) / w
  return (x > 0 && bg[i - 1] === 1) || (x < w - 1 && bg[i + 1] === 1) || (y > 0 && bg[i - w] === 1) || (y < h - 1 && bg[i + w] === 1)
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

/** 裁掉四周全透明的部分，留 PAD 像素。全透明的图报错（多半是背景色选错了）。 */
export function trim(img: RawImage): RawImage {
  const { width: w, height: h, data } = img
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! === 0) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) throw new Error('the keyed image is fully transparent: is the background color right?')
  x0 = Math.max(0, x0 - PAD)
  y0 = Math.max(0, y0 - PAD)
  x1 = Math.min(w - 1, x1 + PAD)
  y1 = Math.min(h - 1, y1 + PAD)
  const tw = x1 - x0 + 1
  const th = y1 - y0 + 1
  const out = new Uint8Array(tw * th * 4)
  for (let y = 0; y < th; y++) out.set(data.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + tw) * 4), y * tw * 4)
  return { data: out, width: tw, height: th }
}
