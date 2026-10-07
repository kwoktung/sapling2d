import { report, screenCanvas, perfProbe } from './polyfills'
import 'pixi.js/unsafe-eval'
import { Container, DOMAdapter, Graphics, ImageSource, Sprite, Text, Texture, WebGLRenderer, isWebGLSupported } from 'pixi.js'
import { World, Circle, Box, type Body } from 'planck'
import { WechatAdapter } from './adapter'

declare const wx: any
declare const __LOG_URL__: string
declare const __HIGH_PERF__: boolean
declare const __STRESS__: boolean

DOMAdapter.set(WechatAdapter)

/** 同时打到控制台，并发给本地日志服务（log-server.mjs） */
function log(tag: string, data?: unknown) {
  const text = typeof data === 'string' ? data : JSON.stringify(data)
  console.log('[spike]', tag, text ?? '')
  try {
    wx.request({ url: __LOG_URL__, method: 'POST', data: JSON.stringify({ tag, data }), fail: () => {} })
  } catch {}
}
wx.onError?.((e: any) => log('onError', { message: e?.message, stack: e?.stack }))
wx.onUnhandledRejection?.((e: any) => log('unhandledRejection', { reason: String(e?.reason?.message ?? e?.reason) }))

const PPM = 50 // pixelsPerMeter
// 固定 seed 的随机数，便于和 Node 里的模拟逐步对比
let seed = 1
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647

function loadImage(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const img = wx.createImage()
    img.onload = () => resolve(img)
    img.onerror = (e: any) => reject(e)
    img.src = path
  })
}

function readFile(path: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) =>
    wx.getFileSystemManager().readFile({ filePath: path, success: (r: any) => resolve(r.data), fail: reject }),
  )
}

/** 检查 measureText 返回了哪些字段：pixi 依赖 actualBoundingBoxAscent/Descent */
function probeMeasureText() {
  const ctx = wx.createCanvas().getContext('2d')
  ctx.font = '32px sans-serif'
  const m = ctx.measureText('Hg中文')
  const fields: Record<string, unknown> = {}
  for (const k of ['width', 'actualBoundingBoxAscent', 'actualBoundingBoxDescent', 'actualBoundingBoxLeft', 'actualBoundingBoxRight', 'fontBoundingBoxAscent', 'fontBoundingBoxDescent']) {
    fields[k] = (m as any)[k]
  }
  fields.letterSpacingInPrototype = 'letterSpacing' in Object.getPrototypeOf(ctx)
  return fields
}

async function main() {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  const resolution = Math.min(info.pixelRatio, 2)
  report.window = { w: info.windowWidth, h: info.windowHeight, pixelRatio: info.pixelRatio, safeArea: info.safeArea }
  report.build = { iOSHighPerformance: __HIGH_PERF__, stress: __STRESS__ }
  report.isWebGLSupported = isWebGLSupported()
  report.measureText = probeMeasureText()

  // 不走 autoDetectRenderer：避免 isWebGLSupported 的 stencil 检查误判后退回 canvas 渲染器
  const renderer = new WebGLRenderer()
  await renderer.init({
    canvas: screenCanvas,
    width: info.windowWidth,
    height: info.windowHeight,
    resolution,
    preferWebGLVersion: 1,
    skipExtensionImports: true,
    antialias: false,
    background: 0x1e2a38,
  })
  report.renderer = {
    webGLVersion: (renderer as any).context.webGLVersion,
    canvasSize: [screenCanvas.width, screenCanvas.height],
    extensions: (renderer as any).gl.getSupportedExtensions(),
  }

  const stage = new Container()
  const W = info.windowWidth
  const H = info.windowHeight

  // 精灵：包内图片 + 显式构造 ImageSource（WeChat 的 Image 过不了 pixi 的 instanceof 自动识别）
  const img = await loadImage('assets/fruit.png')
  const fruitTex = new Texture({ source: new ImageSource({ resource: img }) })
  report.image = { w: img.width, h: img.height }

  // 文字
  const title = new Text({ text: 'sapling2d spike 中文 Hg', style: { fill: 0xffffff, fontSize: 22 } })
  title.position.set(16, (info.safeArea?.top ?? 20) + 8)
  const hud = new Text({ text: '', style: { fill: 0xaee6ff, fontSize: 14, lineHeight: 18 } })
  hud.position.set(16, title.y + 36)
  // 用一条细线标出文字框的上下边，肉眼检查 ascent/descent 是否正确
  const textBox = new Graphics()
  // HUD 放在单独的最上层容器里，带半透明底，避免被水果盖住
  const hudLayer = new Container()
  const hudBg = new Graphics().rect(0, 0, W, hud.y + 80).fill({ color: 0x000000, alpha: 0.6 })
  hudLayer.addChild(hudBg, textBox, title, hud)

  // 物理：planck，y 轴向下，单位为米
  const world = new World({ gravity: { x: 0, y: 9.8 * 2 } })
  const ground = world.createBody({ type: 'static', position: { x: W / 2 / PPM, y: (H - 40) / PPM } })
  ground.createFixture({ shape: new Box(W / 2 / PPM, 20 / PPM), friction: 0.6 })
  for (const x of [0, W]) {
    world.createBody({ type: 'static', position: { x: x / PPM, y: H / 2 / PPM } })
      .createFixture({ shape: new Box(10 / PPM, H / 2 / PPM) })
  }
  const groundGfx = new Graphics().rect(0, H - 60, W, 40).fill(0x3b5b3b)
  stage.addChild(groundGfx)

  const balls: { body: Body; sprite: Sprite }[] = []
  function spawn(x: number, y: number) {
    const r = 18 + rand() * 22
    const body = world.createBody({ type: 'dynamic', position: { x: x / PPM, y: y / PPM } })
    body.createFixture({ shape: new Circle(r / PPM), density: 1, friction: 0.4, restitution: 0.15 })
    const sprite = new Sprite(fruitTex)
    sprite.anchor.set(0.5)
    sprite.width = sprite.height = r * 2
    stage.addChild(sprite)
    balls.push({ body, sprite })
  }
  for (let i = 0; i < 8; i++) spawn(W / 2 + (i % 3) * 30 - 30, 120 + i * 40)

  // 音频：WebAudio 播音效，InnerAudioContext 放 BGM。都在第一次触摸时启动
  let actx: any = null
  let popBuffer: any = null
  let bgm: any = null
  let audioUnlocked = false
  report.audio = { webAudio: typeof wx.createWebAudioContext }
  try {
    actx = wx.createWebAudioContext()
    report.audio.initialState = actx.state
    const data = await readFile('assets/pop.mp3')
    popBuffer = await new Promise((resolve, reject) => {
      const p = actx.decodeAudioData(data, resolve, reject)
      if (p && typeof p.then === 'function') p.then(resolve, reject)
    })
    report.audio.decoded = { duration: popBuffer.duration, sampleRate: popBuffer.sampleRate }
  } catch (e: any) {
    report.audio.error = String(e?.message ?? e)
  }
  function playPop() {
    if (!actx || !popBuffer) return
    const src = actx.createBufferSource()
    src.buffer = popBuffer
    const gain = actx.createGain()
    gain.gain.value = 0.5
    src.connect(gain)
    gain.connect(actx.destination)
    src.start(0)
  }

  // 触摸
  let touchCount = 0
  wx.onTouchStart((e: any) => {
    const t = e.changedTouches[0]
    if (touchCount === 0) {
      report.touch = { keys: Object.keys(e), touchKeys: Object.keys(t), sample: { clientX: t.clientX, clientY: t.clientY, pageX: t.pageX, pageY: t.pageY } }
      log('first touch', report.touch)
    }
    touchCount++
    if (!audioUnlocked) {
      audioUnlocked = true
      actx?.resume?.()
      bgm = wx.createInnerAudioContext()
      bgm.src = 'assets/bgm.mp3'
      bgm.loop = true
      bgm.volume = 0.3
      bgm.onError((err: any) => (report.audio.bgmError = err.errMsg))
      bgm.play()
      report.audio.stateAfterResume = actx?.state
    }
    for (const touch of e.changedTouches) spawn(touch.clientX, touch.clientY)
    playPop()
  })

  wx.onHide(() => { report.lastHide = Date.now(); bgm?.pause(); actx?.suspend?.() })
  wx.onShow(() => { bgm?.play(); actx?.resume?.(); lastTime = performance.now() })

  // 主循环：物理固定 60Hz 步进加累加器，渲染跟 rAF 走
  const STEP = 1 / 60
  let acc = 0
  let lastTime = performance.now()
  let frames = 0
  let fpsTime = lastTime
  let fps = 0
  let reported = false
  let heartbeat = 0
  let physicsSteps = 0
  let lastStressSpawn = 0
  let hudMsPerStep = 0
  // JIT 探针：对象数组 + 小函数调用。Node 参照：有 JIT 约 1.6ms，--jitless 约 22ms
  const jitProbeMs = (() => {
    const t = performance.now()
    const pts: { x: number; y: number }[] = []
    for (let i = 0; i < 1000; i++) pts.push({ x: i, y: i * 2 })
    const dot = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x * b.x + a.y * b.y
    let acc = 0
    for (let k = 0; k < 300; k++) for (let i = 1; i < pts.length; i++) acc += dot(pts[i], pts[i - 1]) * 1e-9
    return +(performance.now() - t + (acc < 0 ? 1 : 0)).toFixed(1)
  })()
  report.jitProbeMs = jitProbeMs
  let physMs = 0
  let stepCount = 0
  let renderMs = 0
  let renderFrames = 0

  function frame() {
    const now = performance.now()
    let dt = (now - lastTime) / 1000
    lastTime = now
    if (dt > 0.25) dt = 0.25
    acc += dt
    let steps = 0
    const tPhys = performance.now()
    while (acc >= STEP && steps < 5) {
      world.step(STEP, 8, 3)
      acc -= STEP
      steps++
      physicsSteps++
      if ([1, 30, 60, 120, 300, 600].includes(physicsSteps)) {
        log(`physics@${physicsSteps}`, {
          dt,
          wxNow: wx.getPerformance().now(),
          perfNow: performance.now(),
          balls: balls.map(({ body }) => {
            const p = body.getPosition()
            const v = body.getLinearVelocity()
            return `(${(p.x * PPM) | 0},${(p.y * PPM) | 0} v=${v.x.toFixed(2)},${v.y.toFixed(2)} w=${body.getAngularVelocity().toFixed(2)}${body.isAwake() ? '' : ' zz'})`
          }).join(' '),
        })
      }
    }
    physMs += performance.now() - tPhys
    stepCount += steps
    for (const b of balls) {
      const p = b.body.getPosition()
      b.sprite.position.set(p.x * PPM, p.y * PPM)
      b.sprite.rotation = b.body.getAngle()
    }

    frames++
    if (now - fpsTime >= 1000) {
      fps = Math.round((frames * 1000) / (now - fpsTime))
      if (++heartbeat % 2 === 0) {
        const awake = balls.filter((b) => b.body.isAwake()).length
        log('heartbeat', {
          fps, bodies: balls.length, awake, highPerf: __HIGH_PERF__, w: W,
          // 平均每个物理步的耗时、平均每帧的渲染耗时（毫秒）
          msPerStep: (hudMsPerStep = +(physMs / Math.max(1, stepCount)).toFixed(2)),
          renderMs: +(renderMs / Math.max(1, renderFrames)).toFixed(2),
          touches: touchCount, audio: actx?.state,
        })
      }
      physMs = 0; stepCount = 0; renderMs = 0; renderFrames = 0
      frames = 0
      fpsTime = now
      textBox.clear()
        .rect(title.x, title.y, title.width, title.height).stroke({ color: 0xff4466, width: 1 })
    }
    hud.text = [
      `fps ${fps}   bodies ${balls.length}   touches ${touchCount}`,
      `webgl v${report.renderer.webGLVersion}   res ${resolution}   audio ${actx?.state ?? 'n/a'}`,
      `${__HIGH_PERF__ ? 'highPerf ON' : 'highPerf OFF'}   ms/step ${hudMsPerStep}   jitProbe ${jitProbeMs}ms`,
      `点击屏幕：生成水果 + 音效（首次点击开始 BGM）`,
    ].join('\n')

    // 压力测试：3 秒后每 0.2 秒在顶部随机位置生成一个球，直到 150 个
    if (__STRESS__ && reported && balls.length < 150 && now - lastStressSpawn > 200) {
      lastStressSpawn = now
      spawn(40 + rand() * (W - 80), 140)
    }

    if (!reported && Date.now() - perfProbe.dateStart > 3000) {
      reported = true
      // performance 单位实测：wx.getPerformance().now() 的差值 / Date.now() 的差值
      const wxNow = wx.getPerformance().now()
      report.wxPerfUnitRatio = (wxNow - perfProbe.wxStart) / (Date.now() - perfProbe.dateStart)
      report.textBox = { w: title.width, h: title.height }
      log('REPORT', report)
    }

    if (stage.children[stage.children.length - 1] !== hudLayer) stage.addChild(hudLayer)
    const tRender = performance.now()
    renderer.render(stage)
    renderMs += performance.now() - tRender
    renderFrames++
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  log('started', report)
}

main().catch((e) => {
  console.error('[spike] FAILED', e?.message ?? e, e?.stack)
  log('FAILED', { message: String(e?.message ?? e), stack: String(e?.stack ?? ''), report })
})
