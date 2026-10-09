/**
 * TileMap 渲染压测：同一张地图、同样的镜头运动，比较几种 Pixi 画法。浏览器和微信小游戏共用。
 *
 * 不经过引擎的节点树（引擎还没有 TileMap），直接用 Pixi，和 PixiRenderer 用同样的初始化参数。
 * 每帧分别计时：更新（镜头 + 区块裁剪）、绘制（CPU 提交），以及帧间隔；另外统计改格子（顶砖块）的耗时和 draw call 数。
 *
 * 画法：
 * - sprites：每格一个 Sprite，全部放在一个容器里，不裁剪（基线）
 * - chunks：每 16×16 格一个容器，屏幕外的区块 `visible = false`
 * - groups：同 chunks，但每个区块是 render group（`isRenderGroup`）
 * - mesh：每个区块一个 Mesh（一份顶点数据，空格子是退化四边形），屏幕外不显示
 * - cached：同 chunks，屏幕内的区块 `cacheAsTexture`（离开屏幕就释放缓存贴图）
 */
import { Container, ImageSource, Mesh, MeshGeometry, Rectangle, Sprite, Text, Texture, WebGLRenderer } from 'pixi.js'

export const MODES = ['sprites', 'chunks', 'groups', 'mesh', 'cached'] as const
export type Mode = (typeof MODES)[number]

export interface BenchOptions {
  mode: Mode
  /** 每格都放图块（最坏情况）；默认是像关卡一样的稀疏地图。 */
  fill: boolean
  /** 用四周外扩 1px 的图块集（对比接缝漏色）。 */
  extrude: boolean
  /** 镜头容器（地图的父节点）设为 render group：镜头移动只改一个 uniform，不重算子节点的变换。 */
  camGroup: boolean
  /** 运行时长（毫秒），前 WARMUP_MS 不计入。Infinity 表示一直跑。 */
  durationMs: number
}

/** 平台差异：浏览器和小游戏各自实现。 */
export interface Env {
  canvas: unknown
  now(): number
  requestFrame(cb: () => void): void
  /** 屏幕尺寸（CSS 像素）和像素比。 */
  screen(): { width: number; height: number; dpr: number }
  loadImage(path: string): Promise<unknown>
  webglVersion: 1 | 2
}

export interface Row {
  label: string
  fps: number
  frameP95: number
  update: number
  draw: number
  drawP95: number
  drawCalls: number
  editAvg: number
  editMax: number
  tiles: number
}

export const TILE = 16
export const CHUNK = 16
export const MAP_W = 512
export const MAP_H = 32
export const LAYERS = 3
/** 设计高度（像素）：横屏时一屏约 17 行，和 FC 马里奥差不多。宽度随屏幕比例。 */
export const DESIGN_H = 270
export const WARMUP_MS = 2000
/** 每秒改几次格子（模拟顶碎砖块）。故意比真实游戏频繁，放大重建的开销。 */
const EDITS_PER_SEC = 4
const SPEED = 300

const TILESET_COLS = 8
const TILESET_COUNT = 32

/** 地图：每层一个 Uint16Array，0 是空，1..32 是图块编号。 */
export function makeMap(fill: boolean): Uint16Array[] {
  let seed = 12345
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296)
  const layers: Uint16Array[] = []
  for (let l = 0; l < LAYERS; l++) layers.push(new Uint16Array(MAP_W * MAP_H))
  const [bg, ground, fg] = layers as [Uint16Array, Uint16Array, Uint16Array]
  if (fill) {
    for (const layer of layers) for (let i = 0; i < layer.length; i++) layer[i] = 1 + Math.floor(rand() * TILESET_COUNT)
    return layers
  }
  let h = 24
  for (let x = 0; x < MAP_W; x++) {
    if (rand() < 0.15) h = Math.max(18, Math.min(29, h + (rand() < 0.5 ? -1 : 1)))
    const pit = x % 60 > 54
    for (let y = 0; y < MAP_H; y++) {
      const i = y * MAP_W + x
      if (!pit && y >= h) ground[i] = y === h ? 1 : 9 + ((x + y) % 3)
      // 背景：远山，约占下半屏
      if (y >= h - 6 + Math.round(3 * Math.sin(x / 9))) bg[i] = 17 + ((x * 7 + y) % 4)
      // 前景：零星的草和装饰
      if (y === h - 1 && !pit && rand() < 0.3) fg[i] = 25 + Math.floor(rand() * 4)
    }
    // 浮空平台和砖块
    if (x % 23 === 5) for (let k = 0; k < 4 + Math.floor(rand() * 4); k++) ground[(h - 5) * MAP_W + Math.min(MAP_W - 1, x + k)] = 5
    if (x % 37 === 11) for (let k = 0; k < 3; k++) ground[(h - 9) * MAP_W + Math.min(MAP_W - 1, x + k)] = 6
  }
  return layers
}

/** 一种画法：持有显示对象，按镜头裁剪，支持改单个格子。 */
interface Strategy {
  readonly root: Container
  /** 镜头可见范围（设计像素）。 */
  cull(x0: number, y0: number, x1: number, y1: number): void
  setCell(layer: number, cx: number, cy: number, id: number): void
}

class Tileset {
  readonly textures: Texture[] = [] // 下标 = 图块编号 - 1
  readonly source: ImageSource
  /** 每个图块在整张图里的 uv（u0, v0, u1, v1）。 */
  readonly uvs = new Float32Array(TILESET_COUNT * 4)
  constructor(resource: unknown, extrude: boolean) {
    this.source = new ImageSource({ resource: resource as never, scaleMode: 'nearest' })
    const pad = extrude ? 1 : 0
    const stride = TILE + pad * 2
    const w = this.source.width
    const h = this.source.height
    for (let i = 0; i < TILESET_COUNT; i++) {
      const x = (i % TILESET_COLS) * stride + pad
      const y = Math.floor(i / TILESET_COLS) * stride + pad
      this.textures.push(new Texture({ source: this.source, frame: new Rectangle(x, y, TILE, TILE) }))
      this.uvs.set([x / w, y / h, (x + TILE) / w, (y + TILE) / h], i * 4)
    }
  }
}

/** 一个区块（容器 + 精灵）：chunks / groups / cached 共用。 */
class SpriteChunks implements Strategy {
  readonly root = new Container()
  private readonly _chunks: Container[][] = [] // [layer][chunkIndex]
  private readonly _sprites: (Sprite | null)[][] = []
  private readonly _cw = Math.ceil(MAP_W / CHUNK)
  private readonly _ch = Math.ceil(MAP_H / CHUNK)

  constructor(
    private readonly _set: Tileset,
    map: Uint16Array[],
    private readonly _kind: 'chunks' | 'groups' | 'cached',
    private readonly _cacheResolution: number,
  ) {
    for (let l = 0; l < map.length; l++) {
      const layer = new Container()
      this.root.addChild(layer)
      const chunks: Container[] = []
      for (let i = 0; i < this._cw * this._ch; i++) {
        const c = new Container()
        c.position.set((i % this._cw) * CHUNK * TILE, Math.floor(i / this._cw) * CHUNK * TILE)
        if (_kind === 'groups') c.isRenderGroup = true
        c.visible = false
        layer.addChild(c)
        chunks.push(c)
      }
      this._chunks.push(chunks)
      const sprites: (Sprite | null)[] = new Array(MAP_W * MAP_H).fill(null)
      this._sprites.push(sprites)
      const data = map[l]!
      for (let i = 0; i < data.length; i++) if (data[i]) this._place(l, i % MAP_W, Math.floor(i / MAP_W), data[i]!)
    }
  }

  private _chunk(l: number, cx: number, cy: number): Container {
    return this._chunks[l]![Math.floor(cy / CHUNK) * this._cw + Math.floor(cx / CHUNK)]!
  }

  private _place(l: number, cx: number, cy: number, id: number): void {
    const i = cy * MAP_W + cx
    const sprites = this._sprites[l]!
    let s = sprites[i]
    if (!id) {
      s?.destroy()
      sprites[i] = null
      return
    }
    if (!s) {
      s = new Sprite(this._set.textures[id - 1]!)
      s.position.set((cx % CHUNK) * TILE, (cy % CHUNK) * TILE)
      this._chunk(l, cx, cy).addChild(s)
      sprites[i] = s
    } else s.texture = this._set.textures[id - 1]!
  }

  cull(x0: number, y0: number, x1: number, y1: number): void {
    const s = CHUNK * TILE
    const a = Math.floor(x0 / s)
    const b = Math.floor(y0 / s)
    const c = Math.floor((x1 - 1) / s)
    const d = Math.floor((y1 - 1) / s)
    for (let l = 0; l < this._chunks.length; l++) {
      const chunks = this._chunks[l]!
      for (let i = 0; i < chunks.length; i++) {
        const x = i % this._cw
        const y = (i - x) / this._cw
        const visible = x >= a && x <= c && y >= b && y <= d
        const chunk = chunks[i]!
        if (chunk.visible === visible) continue
        chunk.visible = visible
        if (this._kind === 'cached') {
          if (visible) chunk.cacheAsTexture({ resolution: this._cacheResolution, scaleMode: 'nearest', antialias: false })
          else chunk.cacheAsTexture(false)
        }
      }
    }
  }

  setCell(l: number, cx: number, cy: number, id: number): void {
    this._place(l, cx, cy, id)
    if (this._kind === 'cached') {
      const chunk = this._chunk(l, cx, cy)
      if (chunk.visible) chunk.updateCacheTexture()
    }
  }
}

/** 每格一个精灵，全部放在一个容器里，不裁剪。 */
class FlatSprites implements Strategy {
  readonly root = new Container()
  private readonly _sprites: (Sprite | null)[][] = []
  constructor(
    private readonly _set: Tileset,
    map: Uint16Array[],
  ) {
    for (let l = 0; l < map.length; l++) {
      const layer = new Container()
      this.root.addChild(layer)
      const sprites: (Sprite | null)[] = new Array(MAP_W * MAP_H).fill(null)
      this._sprites.push(sprites)
      const data = map[l]!
      for (let i = 0; i < data.length; i++) {
        if (!data[i]) continue
        const s = new Sprite(_set.textures[data[i]! - 1]!)
        s.position.set((i % MAP_W) * TILE, Math.floor(i / MAP_W) * TILE)
        layer.addChild(s)
        sprites[i] = s
      }
    }
  }
  cull(): void {}
  setCell(l: number, cx: number, cy: number, id: number): void {
    const i = cy * MAP_W + cx
    const s = this._sprites[l]![i]
    if (!id) {
      s?.destroy()
      this._sprites[l]![i] = null
    } else if (s) s.texture = this._set.textures[id - 1]!
    else {
      const n = new Sprite(this._set.textures[id - 1]!)
      n.position.set(cx * TILE, cy * TILE)
      ;(this.root.children[l] as Container).addChild(n)
      this._sprites[l]![i] = n
    }
  }
}

/** 每个区块一个 Mesh：顶点数据容量固定为 CHUNK² 个四边形，空格子写成退化四边形（面积为 0）。 */
class ChunkMeshes implements Strategy {
  readonly root = new Container()
  private readonly _meshes: Mesh[][] = []
  private readonly _cw = Math.ceil(MAP_W / CHUNK)
  private readonly _ch = Math.ceil(MAP_H / CHUNK)

  constructor(
    private readonly _set: Tileset,
    map: Uint16Array[],
  ) {
    const quads = CHUNK * CHUNK
    // iOS 小游戏的 WebGL1 没有 32 位索引：每个区块 1024 个顶点，16 位索引够用
    const indices = new Uint16Array(quads * 6)
    for (let q = 0; q < quads; q++) indices.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6)
    const texture = new Texture({ source: _set.source })
    for (let l = 0; l < map.length; l++) {
      const layer = new Container()
      this.root.addChild(layer)
      const meshes: Mesh[] = []
      for (let c = 0; c < this._cw * this._ch; c++) {
        const geometry = new MeshGeometry({ positions: new Float32Array(quads * 8), uvs: new Float32Array(quads * 8), indices: indices as unknown as Uint32Array })
        const mesh = new Mesh({ geometry, texture })
        mesh.position.set((c % this._cw) * CHUNK * TILE, Math.floor(c / this._cw) * CHUNK * TILE)
        mesh.visible = false
        layer.addChild(mesh)
        meshes.push(mesh)
      }
      this._meshes.push(meshes)
      const data = map[l]!
      for (let i = 0; i < data.length; i++) if (data[i]) this._write(l, i % MAP_W, Math.floor(i / MAP_W), data[i]!)
    }
  }

  /** 写一个四边形的顶点和 uv，不上传（调用方负责 update）。 */
  private _write(l: number, cx: number, cy: number, id: number): Mesh {
    const mesh = this._meshes[l]![Math.floor(cy / CHUNK) * this._cw + Math.floor(cx / CHUNK)]!
    const q = (cy % CHUNK) * CHUNK + (cx % CHUNK)
    const pos = mesh.geometry.positions
    const uv = mesh.geometry.uvs
    const o = q * 8
    if (!id) {
      pos.fill(0, o, o + 8)
      return mesh
    }
    const x0 = (cx % CHUNK) * TILE
    const y0 = (cy % CHUNK) * TILE
    const x1 = x0 + TILE
    const y1 = y0 + TILE
    pos[o] = x0, pos[o + 1] = y0, pos[o + 2] = x1, pos[o + 3] = y0
    pos[o + 4] = x1, pos[o + 5] = y1, pos[o + 6] = x0, pos[o + 7] = y1
    const u = this._set.uvs
    const t = (id - 1) * 4
    const u0 = u[t]!, v0 = u[t + 1]!, u1 = u[t + 2]!, v1 = u[t + 3]!
    uv[o] = u0, uv[o + 1] = v0, uv[o + 2] = u1, uv[o + 3] = v0
    uv[o + 4] = u1, uv[o + 5] = v1, uv[o + 6] = u0, uv[o + 7] = v1
    return mesh
  }

  cull(x0: number, y0: number, x1: number, y1: number): void {
    const s = CHUNK * TILE
    const a = Math.floor(x0 / s)
    const b = Math.floor(y0 / s)
    const c = Math.floor((x1 - 1) / s)
    const d = Math.floor((y1 - 1) / s)
    for (let l = 0; l < this._meshes.length; l++) {
      const meshes = this._meshes[l]!
      for (let i = 0; i < meshes.length; i++) {
        const x = i % this._cw
        const y = (i - x) / this._cw
        meshes[i]!.visible = x >= a && x <= c && y >= b && y <= d
      }
    }
  }

  setCell(l: number, cx: number, cy: number, id: number): void {
    const mesh = this._write(l, cx, cy, id)
    mesh.geometry.getBuffer('aPosition').update()
    mesh.geometry.getBuffer('aUV').update()
  }
}

export interface Bench {
  readonly renderer: WebGLRenderer
  /** 跑一档，返回统计结果。`onTick` 每 500ms 调一次，用于刷新 HUD。 */
  run(options: BenchOptions, onTick?: (row: Row) => void): Promise<Row>
  hud(text: string): void
}

export async function createBench(env: Env): Promise<Bench> {
  const screen = env.screen()
  const renderer = new WebGLRenderer()
  const warn = console.warn
  console.warn = (...args: unknown[]) => (args.some((a) => typeof a === 'string' && /does not support 32 index buffer/.test(a)) ? console.debug(...args) : warn(...args))
  try {
    await renderer.init({
      canvas: env.canvas as never,
      width: screen.width,
      height: screen.height,
      resolution: screen.dpr,
      autoDensity: true,
      background: 0x5c94fc,
      preferWebGLVersion: env.webglVersion,
      skipExtensionImports: true,
      antialias: false,
    })
  } finally {
    console.warn = warn
  }
  // 数 draw call：包一层 gl.drawElements / drawArrays
  const gl = renderer.gl as unknown as Record<string, (...a: unknown[]) => unknown>
  let drawCalls = 0
  for (const name of ['drawElements', 'drawArrays']) {
    const orig = gl[name]!.bind(gl)
    gl[name] = (...a: unknown[]) => (drawCalls++, orig(...a))
  }
  const images = { plain: await env.loadImage('tiles.png'), extruded: await env.loadImage('tiles-extruded.png') }
  const stage = new Container()
  const hudText = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 12, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } } })
  hudText.position.set(8, 8)

  return {
    renderer,
    hud(text) {
      hudText.text = text
    },
    async run(options, onTick) {
      const { width, height, dpr } = env.screen()
      const scale = height / DESIGN_H
      const viewW = width / scale
      const viewH = DESIGN_H
      const set = new Tileset(options.extrude ? images.extruded : images.plain, options.extrude)
      const map = makeMap(options.fill)
      let tiles = 0
      for (const layer of map) for (let i = 0; i < layer.length; i++) if (layer[i]) tiles++
      const t0 = env.now()
      const strategy: Strategy =
        options.mode === 'sprites' ? new FlatSprites(set, map) : options.mode === 'mesh' ? new ChunkMeshes(set, map) : new SpriteChunks(set, map, options.mode, scale * dpr)
      const buildMs = env.now() - t0
      const world = strategy.root
      world.scale.set(scale)
      world.isRenderGroup = options.camGroup
      stage.removeChildren()
      stage.addChild(world, hudText)

      const label = `${options.mode}${options.camGroup ? '+cam' : ''}${options.fill ? ' fill' : ''}${options.extrude ? ' extr' : ''}`
      const s = { update: [] as number[], draw: [] as number[], interval: [] as number[], calls: [] as number[], edits: [] as number[] }
      let rand = 99
      const next = () => ((rand = (rand * 1103515245 + 12345) >>> 0) / 4294967296)
      const start = env.now()
      let last = start
      let lastHud = start
      let lastEdit = start

      const row = await new Promise<Row>((resolve) => {
        const loop = () => {
          const now = env.now()
          const t = (now - start) / 1000
          // 镜头：x 来回扫过整张地图（三角波），y 缓慢上下
          const spanX = MAP_W * TILE - viewW
          const px = (t * SPEED) % (spanX * 2)
          const camX = px < spanX ? px : spanX * 2 - px
          const camY = ((MAP_H * TILE - viewH) * (1 - Math.cos(t * 0.6))) / 2
          const u0 = env.now()
          // 镜头位置对齐到物理像素，避免像素图块抖动
          world.position.set(-Math.round(camX * scale * dpr) / dpr, -Math.round(camY * scale * dpr) / dpr)
          strategy.cull(camX, camY, camX + viewW, camY + viewH)
          let editMs = -1
          if (now - lastEdit > 1000 / EDITS_PER_SEC) {
            lastEdit = now
            const e0 = env.now()
            const cx = Math.floor((camX + next() * viewW) / TILE)
            const cy = Math.floor((camY + next() * viewH) / TILE)
            const id = next() < 0.3 ? 0 : 1 + Math.floor(next() * TILESET_COUNT)
            map[1]![cy * MAP_W + cx] = id
            strategy.setCell(1, cx, cy, id)
            editMs = env.now() - e0
          }
          const u1 = env.now()
          drawCalls = 0
          renderer.render(stage)
          const u2 = env.now()
          if (now - start > WARMUP_MS) {
            s.update.push(u1 - u0 - Math.max(0, editMs))
            s.draw.push(u2 - u1)
            s.interval.push(now - last)
            s.calls.push(drawCalls)
            if (editMs >= 0) s.edits.push(editMs)
          }
          last = now
          if (now - lastHud > 500) {
            lastHud = now
            onTick?.(summarize(label, s, tiles))
          }
          if (now - start >= options.durationMs) return resolve(summarize(label, s, tiles))
          env.requestFrame(loop)
        }
        env.requestFrame(loop)
      })
      stage.removeChild(world)
      world.destroy({ children: true })
      set.source.destroy()
      console.log(`[tilemap] ${label}: build ${buildMs.toFixed(0)} ms`)
      return row
    },
  }
}

function summarize(label: string, s: { update: number[]; draw: number[]; interval: number[]; calls: number[]; edits: number[] }, tiles: number): Row {
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)] ?? 0
  return {
    label,
    fps: 1000 / (avg(s.interval) || 1),
    frameP95: p95(s.interval),
    update: avg(s.update),
    draw: avg(s.draw),
    drawP95: p95(s.draw),
    drawCalls: avg(s.calls),
    editAvg: avg(s.edits),
    editMax: s.edits.length ? Math.max(...s.edits) : 0,
    tiles,
  }
}

export const HEADER = 'mode              |   fps  p95ms | update  draw  p95 | calls | edit avg   max'
export function fmt(r: Row): string {
  const f = (x: number, w = 5, d = 1) => x.toFixed(d).padStart(w)
  return `${r.label.padEnd(17)} | ${f(r.fps)} ${f(r.frameP95, 6)} | ${f(r.update, 6, 2)} ${f(r.draw)} ${f(r.drawP95, 4)} | ${f(r.drawCalls, 5, 0)} | ${f(r.editAvg, 8, 2)} ${f(r.editMax, 5)}`
}
