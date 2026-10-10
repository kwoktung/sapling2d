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
import { chromaKey } from './key.ts'

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
  const background = `Solid flat background color ${bg} filling the whole image (no gradient, no vignette, no shadow on it).`
  if (a.mode === 'edit') return `${a.prompt}\nKeep exactly the same art style, colors, outline and proportions as the reference image. ${background}`
  const style = readFileSync(join(ART, 'style.md'), 'utf8').trim()
  const anchor = STYLE_ANCHOR ? '\nMatch the art style of the reference image exactly (line weight, shading, palette, proportions), but draw the subject described here.' : ''
  return `${style}\n\nSubject: ${a.prompt}${anchor}\n${background}`
}

async function generate(a: AssetSpec): Promise<void> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set')
  const refs = [...(a.mode === 'generate' && STYLE_ANCHOR ? [STYLE_ANCHOR] : []), ...(a.refs ?? [])]
  const parts: unknown[] = [{ text: promptFor(a) }]
  for (const r of refs) {
    const file = join(ART, r)
    if (!existsSync(file)) throw new Error(`${a.id}: reference ${r} does not exist (generate it first)`)
    const bytes = readFileSync(file)
    // 按文件内容判断格式（模型返回的可能是 JPEG，扩展名不一定对）
    const mimeType = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg'
    parts.push({ inlineData: { mimeType, data: bytes.toString('base64') } })
  }
  const body = { contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } } }
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
    const { data, info } = await sharp(raw).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const keyed = chromaKey({ data, width: info.width, height: info.height }, a.background ?? DEFAULT_BG)
    await sharp(Buffer.from(keyed.data), { raw: { width: keyed.width, height: keyed.height, channels: 4 } })
      .png()
      .toFile(join(WORK, `${a.id}.png`))
    console.log(`  key   ${a.id} ${keyed.width}×${keyed.height}`)
  }
}

async function resizeAll(): Promise<void> {
  for (const a of selected) {
    const height = Math.round(a.displayHeight * 2)
    await sharp(join(WORK, `${a.id}.png`))
      .resize({ height, fit: 'inside', kernel: 'lanczos3' })
      .png({ compressionLevel: 9 })
      .toFile(join(SPRITES, `${a.id}.png`))
    console.log(`  size  ${a.id} → ${height}px tall`)
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
      const file = join(SPRITES, `${a.id}.png`)
      if (!existsSync(file)) throw new Error(`${a.id}: art/sprites/${a.id}.png is missing (run key and resize first)`)
      const meta = await sharp(file).metadata()
      packer.add({ width: meta.width!, height: meta.height!, x: 0, y: 0, data: { id: a.id, file, ...(a.pivot ? { pivot: a.pivot } : {}) } })
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
    await sharp({ create: { width: bin.width, height: bin.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(layers)
      .png({ compressionLevel: 9 })
      .toFile(join(PUBLIC, `${name}.png`))
    const json = { frames, meta: { app: 'hero-guard/scripts/art', image: `${name}.png`, format: 'RGBA8888', size: { w: bin.width, h: bin.height }, scale: '1' } }
    writeFileSync(join(PUBLIC, `${name}.json`), `${JSON.stringify(json, null, 1)}\n`)
    console.log(`  pack  ${name}.png ${bin.width}×${bin.height} (${list.length} sprites)`)
  }
}

/** 所有精灵在棋盘格上的拼图：检查抠图边缘、大小是否一致。 */
async function preview(): Promise<void> {
  const cell = 300
  const files = ASSETS.map((a) => join(SPRITES, `${a.id}.png`)).filter(existsSync)
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
