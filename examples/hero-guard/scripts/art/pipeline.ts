/**
 * 美术管线：生成 → 抠图 → 缩放 → 打包。
 *
 *   pnpm art                      # 整条管线（已有原图的素材不重新生成）
 *   pnpm art gen --only archer    # 只跑某一步、只处理某些素材（--only 可以写多个，逗号分隔）
 *   pnpm art gen --force          # 重新生成（覆盖已有原图）
 *
 * 生成需要 GEMINI_API_KEY（Google AI Studio 的 key）。目录（都在 art/ 下）：
 * raw/（AI 原图，不进 git）→ work/（抠好的透明图，不进 git）→ sprites/（缩到显示尺寸 2 倍，进 git）→ public/assets/<图集>.png/.json；
 * 另外输出 preview.png（所有精灵的拼图，不进 git）方便检查。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MaxRectsPacker } from 'maxrects-packer'
import sharp, { type OverlayOptions } from 'sharp'
import { ASSETS, STYLE_ANCHOR, type AssetSpec } from '../../art/assets.ts'
import { chromaKey, trim, type RawImage } from './key.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ART = join(ROOT, 'art')
const RAW = join(ART, 'raw')
const WORK = join(ART, 'work')
const SPRITES = join(ART, 'sprites')
const PUBLIC = join(ROOT, 'public/assets')
const MODEL = 'gemini-3.1-flash-image'
const DEFAULT_BG = '#FF00FF'
const MAX_ATLAS = 2048
const CONCURRENCY = 3

// ---------------------------------------------------------------- 参数

const args = process.argv.slice(2)
const step = args[0] && !args[0].startsWith('--') ? args[0] : 'all'
const flag = (name: string) => args.includes(`--${name}`)
const onlyArg = args[args.indexOf('--only') + 1]
const only = args.includes('--only') && onlyArg ? new Set(onlyArg.split(',')) : null
const selected = ASSETS.filter((a) => !only || only.has(a.id))
if (only) for (const id of only) if (!ASSETS.some((a) => a.id === id)) throw new Error(`no asset "${id}" in art/assets.ts`)

for (const dir of [RAW, WORK, SPRITES, PUBLIC]) mkdirSync(dir, { recursive: true })

// ---------------------------------------------------------------- 生成

function rawFile(id: string): string | null {
  const name = readdirSync(RAW).find((f) => f.replace(/\.[^.]+$/, '') === id)
  return name ? join(RAW, name) : null
}

function promptFor(a: AssetSpec): string {
  const bg = a.background ?? DEFAULT_BG
  const background =
    a.key === false
      ? a.background
        ? `Pure black background (${a.background}) around the subject.`
        : ''
      : `Solid flat background color ${bg} filling the whole image (no gradient, no vignette, no shadow on it).`
  if (a.mode === 'edit') return `${a.prompt}\nKeep exactly the same art style, colors, outline and proportions as the reference image. ${background}`
  if (a.plain) return `${a.prompt}\nNo text, no watermark, no border. ${background}`
  const style = readFileSync(join(ART, 'style.md'), 'utf8').trim()
  const anchor = STYLE_ANCHOR ? '\nMatch the art style of the reference image exactly (line weight, shading, palette, proportions), but draw the subject described here.' : ''
  return `${style}\n\nSubject: ${a.prompt}${anchor}\n${background}`
}

async function generate(a: AssetSpec): Promise<void> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set')
  const refs = [...(a.mode === 'generate' && !a.plain && STYLE_ANCHOR ? [STYLE_ANCHOR] : []), ...(a.refs ?? [])]
  const parts: unknown[] = [{ text: promptFor(a) }]
  for (const r of refs) {
    const file = join(ART, r)
    if (!existsSync(file)) throw new Error(`${a.id}: reference ${r} does not exist (generate it first)`)
    const bytes = readFileSync(file)
    // 按文件内容判断格式（模型返回的可能是 JPEG，扩展名不一定对）
    const mimeType = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg'
    parts.push({ inlineData: { mimeType, data: bytes.toString('base64') } })
  }
  const body = { contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: a.aspect ?? '1:1' } } }
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as { error?: { message: string }; candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[] }
    const image = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData
    if (res.ok && image) {
      const ext = image.mimeType === 'image/png' ? 'png' : 'jpg'
      const old = rawFile(a.id)
      if (old && !old.endsWith(`.${ext}`)) unlinkSync(old) // 换了格式：删掉旧的，免得同一个素材有两张原图
      writeFileSync(join(RAW, `${a.id}.${ext}`), Buffer.from(image.data, 'base64'))
      console.log(`  gen   ${a.id}`)
      return
    }
    const why = json.error?.message ?? `HTTP ${res.status}, no image in the response`
    if (attempt >= 2) throw new Error(`${a.id}: generation failed: ${why}`)
    console.warn(`  gen   ${a.id}: ${why}; retrying`)
  }
}

async function genAll(): Promise<void> {
  // 挑定的图（from）直接拷成原图
  for (const a of selected) {
    if (!a.from || (rawFile(a.id) && !flag('force'))) continue
    const src = join(ART, a.from)
    if (!existsSync(src)) throw new Error(`${a.id}: from ${a.from} does not exist`)
    const old = rawFile(a.id)
    if (old) unlinkSync(old)
    writeFileSync(join(RAW, `${a.id}${src.slice(src.lastIndexOf('.'))}`), readFileSync(src))
    console.log(`  from  ${a.id} ← ${a.from}`)
  }
  const todo = selected.filter((a) => !a.from && (flag('force') || !rawFile(a.id)))
  // edit 模式依赖 refs 里的原图：先做 generate，再做 edit
  for (const batch of [todo.filter((a) => a.mode === 'generate'), todo.filter((a) => a.mode === 'edit')]) {
    for (let i = 0; i < batch.length; i += CONCURRENCY) await Promise.all(batch.slice(i, i + CONCURRENCY).map(generate))
  }
  if (!todo.length) console.log('  gen   (all raw images exist; use --force to regenerate)')
}

// ---------------------------------------------------------------- 抠图、缩放

async function keyAll(): Promise<void> {
  for (const a of selected) {
    const raw = rawFile(a.id)
    if (!raw) throw new Error(`${a.id}: no raw image in art/raw/ (run gen first)`)
    if (a.key === false) {
      // 不抠图：原样转成 PNG（背景、黑底特效）
      await sharp(raw).png().toFile(join(WORK, `${a.id}.png`))
      console.log(`  copy  ${a.id}`)
      continue
    }
    const { data, info } = await sharp(raw).flop(!!a.mirror).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const bg = actualBackground({ data, width: info.width, height: info.height }, a.background ?? DEFAULT_BG)
    if (a.frames) {
      await keyFrames(a, chromaKey({ data, width: info.width, height: info.height }, bg, { trim: false }))
      continue
    }
    const keyed = chromaKey({ data, width: info.width, height: info.height }, bg)
    await sharp(Buffer.from(keyed.data), { raw: { width: keyed.width, height: keyed.height, channels: 4 } })
      .png()
      .toFile(join(WORK, `${a.id}.png`))
    console.log(`  key   ${a.id} ${keyed.width}×${keyed.height}`)
  }
}

/**
 * 实际的背景色：AI 画的“纯色背景”常常偏一点（例如要 #FF00FF 给了 #D141BC），被身体围住的小块背景就按“像不像背景色”判断不出来。
 * 取四个角的颜色（各 8×8 的平均），和要求的背景色色相接近（夹角 < 25°）就用它，否则还用要求的颜色。
 */
function actualBackground(img: RawImage, wanted: string): string {
  const { width: w, height: h, data } = img
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (const [cx, cy] of [[0, 0], [w - 8, 0], [0, h - 8], [w - 8, h - 8]] as const) {
    for (let y = cy; y < cy + 8; y++) {
      for (let x = cx; x < cx + 8; x++) {
        const o = (y * w + x) * 4
        r += data[o]!
        g += data[o + 1]!
        b += data[o + 2]!
        n++
      }
    }
  }
  const got = [r / n, g / n, b / n]
  const want = [1, 3, 5].map((i) => parseInt(wanted.slice(i, i + 2), 16))
  const chroma = (c: number[]) => {
    const m = (c[0]! + c[1]! + c[2]!) / 3
    return c.map((x) => x - m)
  }
  const p = chroma(got)
  const q = chroma(want)
  const cos = (p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!) / (Math.hypot(...p) * Math.hypot(...q) || 1)
  if (cos < Math.cos((25 * Math.PI) / 180)) return wanted
  return `#${got.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`
}

/** 素材的精灵名：普通素材是 id，横排的帧是 `<id>_0` … `<id>_<N-1>`。 */
function spriteIds(a: AssetSpec): string[] {
  return a.frames ? Array.from({ length: a.frames }, (_, i) => `${a.id}_${i}`) : [a.id]
}

/**
 * 横排的帧：按连通块分帧——每个角色连同手里的东西是连在一起的一块，整块分给它的中心最靠近的那一格（等分的 N 格）。
 * AI 画的帧常常挨得很近、横向互相重叠（上一帧的盾和下一帧的刀尖在同一列），竖着切会把刀尖切掉，按块分就不会。
 * 每帧裁边后放进同样大小的画布：底边对齐（脚底在同一条线上）、水平居中，这样所有帧共用一个锚点，播放时角色不会跳。
 */
async function keyFrames(a: AssetSpec, keyed: RawImage): Promise<void> {
  const n = a.frames!
  const { width: W, height: H, data } = keyed
  const { label, blobs } = components(data, W, H)
  const cellW = W / n
  // 每个连通块分给哪一帧：按水平中心落在哪一格
  const owner = blobs.map((b) => Math.min(n - 1, Math.max(0, Math.floor(b.cx / cellW))))
  const wide = blobs.filter((b) => b.x1 - b.x0 > cellW * 1.3).length
  if (wide) console.warn(`  key   ${a.id}: ${wide} blob(s) span more than one frame (frames touch); they go to one frame`)
  const cells: RawImage[] = []
  for (let i = 0; i < n; i++) {
    const mine = blobs.filter((_, k) => owner[k] === i)
    if (!mine.length) throw new Error(`${a.id}: frame ${i} is empty (the model drew fewer than ${n} frames?)`)
    const x0 = Math.min(...mine.map((b) => b.x0))
    const x1 = Math.max(...mine.map((b) => b.x1))
    const y0 = Math.min(...mine.map((b) => b.y0))
    const y1 = Math.max(...mine.map((b) => b.y1))
    const cw = x1 - x0 + 1
    const ch = y1 - y0 + 1
    const out = new Uint8Array(cw * ch * 4)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const p = y * W + x
        const l = label[p]!
        if (l < 0 || owner[l] !== i) continue
        const o = ((y - y0) * cw + (x - x0)) * 4
        out.set(data.subarray(p * 4, p * 4 + 4), o)
      }
    }
    cells.push({ data: out, width: cw, height: ch })
  }
  const w = Math.max(...cells.map((c) => c.width))
  const h = Math.max(...cells.map((c) => c.height))
  for (let i = 0; i < n; i++) {
    const c = cells[i]!
    await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: Buffer.from(c.data), raw: { width: c.width, height: c.height, channels: 4 }, left: Math.round((w - c.width) / 2), top: h - c.height }])
      .png()
      .toFile(join(WORK, `${a.id}_${i}.png`))
  }
  console.log(`  key   ${a.id} ${n} frames, ${w}×${h}`)
}

/** 不透明像素的连通块（8 邻接）：每个像素属于哪一块（透明的是 -1），每块的范围和水平中心（按像素数加权）。 */
function components(data: Uint8Array, w: number, h: number) {
  const label = new Int32Array(w * h).fill(-1)
  const blobs: { size: number; cx: number; x0: number; x1: number; y0: number; y1: number }[] = []
  const stack: number[] = []
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || data[start * 4 + 3]! === 0) continue
    const id = blobs.length
    const blob = { size: 0, cx: 0, x0: w, x1: -1, y0: h, y1: -1 }
    blobs.push(blob)
    label[start] = id
    stack.push(start)
    let sumX = 0
    while (stack.length) {
      const p = stack.pop()!
      const x = p % w
      const y = (p - x) / w
      blob.size++
      sumX += x
      if (x < blob.x0) blob.x0 = x
      if (x > blob.x1) blob.x1 = x
      if (y < blob.y0) blob.y0 = y
      if (y > blob.y1) blob.y1 = y
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const q = ny * w + nx
          if (label[q] !== -1 || data[q * 4 + 3]! === 0) continue
          label[q] = id
          stack.push(q)
        }
      }
    }
    blob.cx = sumX / blob.size
  }
  return { label, blobs }
}

async function resizeAll(): Promise<void> {
  for (const a of selected) {
    if (a.frames) {
      // 所有帧的画布一样大：按同样的高度缩放，比例一致
      for (const id of spriteIds(a)) {
        await sharp(join(WORK, `${id}.png`)).resize({ height: Math.round(a.displayHeight * 2), kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(join(SPRITES, `${id}.png`))
      }
      console.log(`  size  ${a.id} ${a.frames} frames → ${Math.round(a.displayHeight * 2)}px tall`)
      continue
    }
    const size = a.displayWidth ? { width: Math.round(a.displayWidth * 2) } : { height: Math.round(a.displayHeight * 2) }
    await sharp(join(WORK, `${a.id}.png`))
      .resize({ ...size, fit: 'inside', kernel: 'lanczos3' })
      .png({ compressionLevel: 9 })
      .toFile(join(SPRITES, `${a.id}.png`))
    console.log(`  size  ${a.id} → ${a.displayWidth ? `${size.width}px wide` : `${size.height}px tall`}`)
  }
}

// ---------------------------------------------------------------- 打包、预览

interface Rect {
  width: number
  height: number
  x: number
  y: number
  data: { id: string; file: string; pivot?: { x: number; y: number } }
}

/** 打包整张图集（不管 --only：图集要包含所有属于它的素材）。 */
async function packAll(): Promise<void> {
  const atlases = new Map<string, AssetSpec[]>()
  for (const a of ASSETS) {
    if (!a.atlas) continue // 不打包的素材（候选图等）
    if (only && !ASSETS.some((b) => only.has(b.id) && b.atlas === a.atlas)) continue
    atlases.set(a.atlas, [...(atlases.get(a.atlas) ?? []), a])
  }
  for (const [name, list] of atlases) {
    const packer = new MaxRectsPacker<Rect>(MAX_ATLAS, MAX_ATLAS, 2, { smart: true, pot: false, square: false, allowRotation: false, border: 0 })
    for (const a of list) {
      for (const id of spriteIds(a)) {
        const file = join(SPRITES, `${id}.png`)
        if (!existsSync(file)) throw new Error(`${id}: art/sprites/${id}.png is missing (run key and resize first)`)
        const meta = await sharp(file).metadata()
        packer.add({ width: meta.width!, height: meta.height!, x: 0, y: 0, data: { id, file, ...(a.pivot ? { pivot: a.pivot } : {}) } })
      }
    }
    if (packer.bins.length !== 1) throw new Error(`atlas "${name}" does not fit in ${MAX_ATLAS}×${MAX_ATLAS}; split it`)
    const bin = packer.bins[0]!
    const frames: Record<string, unknown> = {}
    const layers: OverlayOptions[] = []
    for (const r of bin.rects) {
      layers.push({ input: r.data.file, left: r.x, top: r.y })
      frames[r.data.id] = {
        frame: { x: r.x, y: r.y, w: r.width, h: r.height },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: r.width, h: r.height },
        sourceSize: { w: r.width, h: r.height },
        ...(r.data.pivot ? { pivot: r.data.pivot } : {}),
      }
    }
    // 调色板量化（有损，256 色 + 抖动）：卡通平涂的图看不出差别，体积大约是原来的 1/3（小游戏包只有 4 MB）
    await sharp({ create: { width: bin.width, height: bin.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(layers)
      .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
      .toFile(join(PUBLIC, `${name}.png`))
    const json = { frames, meta: { app: 'hero-guard/scripts/art', image: `${name}.png`, format: 'RGBA8888', size: { w: bin.width, h: bin.height }, scale: '1' } }
    writeFileSync(join(PUBLIC, `${name}.json`), `${JSON.stringify(json, null, 1)}\n`)
    console.log(`  pack  ${name}.png ${bin.width}×${bin.height} (${list.length} sprites)`)
  }
  // 不进图集、单独发布的素材（背景）
  for (const a of selected.filter((x) => x.publish)) {
    const out = join(PUBLIC, `${a.id}.${a.publish}`)
    const img = sharp(join(SPRITES, `${a.id}.png`))
    await (a.publish === 'jpg' ? img.flatten({ background: '#000000' }).jpeg({ quality: 82, mozjpeg: true }) : img.png({ compressionLevel: 9, palette: true, quality: 90 })).toFile(out)
    console.log(`  publish ${a.id}.${a.publish}`)
  }
}

/** 所有精灵在棋盘格上的拼图：检查抠图边缘、大小是否一致。 */
async function preview(): Promise<void> {
  const cell = 300
  const files = ASSETS.flatMap((a) => spriteIds(a).map((id) => join(SPRITES, `${id}.png`))).filter(existsSync)
  if (!files.length) return
  const cols = Math.min(5, files.length)
  const rows = Math.ceil(files.length / cols)
  const checker = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * cell}"><defs><pattern id="c" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="#3a5a34"/><rect width="16" height="16" fill="#46683f"/><rect x="16" y="16" width="16" height="16" fill="#46683f"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`,
  )
  const layers: OverlayOptions[] = []
  for (let i = 0; i < files.length; i++) {
    const img = await sharp(files[i]!).resize({ width: cell - 20, height: cell - 20, fit: 'inside', withoutEnlargement: true }).toBuffer()
    const m = await sharp(img).metadata()
    layers.push({ input: img, left: (i % cols) * cell + Math.round((cell - m.width!) / 2), top: Math.floor(i / cols) * cell + Math.round((cell - m.height!) / 2) })
  }
  await sharp(checker).composite(layers).png().toFile(join(ART, 'preview.png'))
  console.log('  preview art/preview.png')
}

// ---------------------------------------------------------------- 入口

const steps: Record<string, () => Promise<void>> = { gen: genAll, key: keyAll, resize: resizeAll, pack: packAll, preview }
if (step === 'all') {
  for (const s of ['gen', 'key', 'resize', 'pack', 'preview']) await steps[s]!()
} else if (steps[step]) {
  await steps[step]()
} else {
  throw new Error(`unknown step "${step}" (gen | key | resize | pack | preview)`)
}
