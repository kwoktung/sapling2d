import type { Container } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { Camera2D, Node2D, Rect2, Scene, TileMapLayer, tileset, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { PixiRenderer } from '../src/render/PixiRenderer'

// 默认视口：设计 750×1334，屏幕 750×1334，缩放 1；设计区域中心 (375, 667)

async function setup(build: (scene: Scene) => void) {
  class Main extends Scene {
    override ready() {
      build(this)
    }
  }
  const g = await createTestGame({ main: Main })
  g.step()
  return g
}

describe('Camera2D', () => {
  it('没有相机时画面不偏移', async () => {
    const g = await setup(() => {})
    const vp = g.tree.viewport
    expect([vp._canvasX, vp._canvasY]).toEqual([0, 0])
    expect(vp.visibleWorldRect).toEqual(vp.visibleRect)
    expect(vp.screenToWorld(v(10, 20))).toEqual(v(10, 20))
  })

  it('相机的全局位置是画面中心；坐标换算', async () => {
    let player!: Node2D
    const g = await setup((scene) => {
      player = scene.add(new Node2D({ position: v(1000, 500) }))
      player.add(new Camera2D())
    })
    const vp = g.tree.viewport
    expect(vp.visibleWorldRect).toEqual(new Rect2(625, -167, 750, 1334))
    expect(vp.screenToWorld(v(375, 667))).toEqual(v(1000, 500))
    expect(vp.worldToScreen(v(1000, 500))).toEqual(v(375, 667))
    player.x = 1200
    g.step()
    expect(vp.screenToWorld(v(375, 667))).toEqual(v(1200, 500))
  })

  it('offset：画面中心相对相机偏移', async () => {
    const g = await setup((scene) => scene.add(new Camera2D({ position: v(1000, 500), offset: v(100, 0) })))
    expect(g.tree.viewport.screenToWorld(v(375, 667))).toEqual(v(1100, 500))
  })

  it('limit：画面不超出边界；范围比画面小时居中', async () => {
    let cam!: Camera2D
    const g = await setup((scene) => {
      cam = scene.add(new Camera2D({ position: v(100, 100), limitLeft: 0, limitTop: 0, limitRight: 3000, limitBottom: 2000 }))
    })
    expect(cam.screenCenter).toEqual(v(375, 667)) // 左上角贴着 (0, 0)
    cam.position = v(2900, 1900)
    g.step()
    expect(cam.screenCenter).toEqual(v(3000 - 375, 2000 - 667))
    cam.limitRight = 500 // 宽度 500 < 750：水平居中
    g.step()
    expect(cam.screenCenter.x).toBe(250)
  })

  it('平滑跟随：按帧时间指数逼近，结果确定；成为当前相机时直接跳到目标；resetSmoothing 跳过平滑', async () => {
    let cam!: Camera2D
    const g = await setup((scene) => {
      cam = scene.add(new Camera2D({ position: v(0, 0), positionSmoothingEnabled: true, positionSmoothingSpeed: 5 }))
    })
    expect(cam.screenCenter).toEqual(v(0, 0))
    cam.x = 600
    g.step()
    const k = 1 - Math.exp(-5 / 60)
    expect(cam.screenCenter.x).toBeCloseTo(600 * k, 9)
    g.stepSeconds(3)
    expect(cam.screenCenter.x).toBeCloseTo(600, 3)
    cam.x = 5000
    cam.resetSmoothing()
    g.step()
    expect(cam.screenCenter.x).toBe(5000)
  })

  it('当前相机：第一个启用的自动成为当前；makeCurrent 切换；关掉或移除后换下一个；都没有时不偏移', async () => {
    let a!: Camera2D
    let b!: Camera2D
    const g = await setup((scene) => {
      a = scene.add(new Camera2D({ name: 'A', position: v(1000, 0) }))
      b = scene.add(new Camera2D({ name: 'B', position: v(2000, 0) }))
    })
    const center = () => g.tree.viewport.screenToWorld(v(375, 667)).x
    expect([a.isCurrent, b.isCurrent, center()]).toEqual([true, false, 1000])
    b.makeCurrent()
    g.step()
    expect([a.isCurrent, b.isCurrent, center()]).toEqual([false, true, 2000])
    b.enabled = false
    g.step()
    expect([a.isCurrent, center()]).toEqual([true, 1000])
    expect(() => b.makeCurrent()).toThrow(/disabled/)
    a.queueFree()
    g.step()
    expect(g.tree._currentCamera).toBeNull()
    expect(center()).toBe(375)
    b.enabled = true
    g.step()
    expect(b.isCurrent).toBe(true)
    expect(g.dump()).toContain('B (Camera2D) position=(2000, 0) current=true')
  })

  it('指针拾取按相机换算：点屏幕中心命中相机处的节点，事件坐标是世界坐标', async () => {
    let target!: Node2D
    const hits: string[] = []
    const g = await setup((scene) => {
      target = scene.add(new Node2D({ position: v(3000, 2000), inputPickable: true, hitArea: new Rect2(-20, -20, 40, 40) }))
      target.pointerDown.connect((e) => hits.push(`${e.position.x},${e.position.y} ${e.localPosition.x},${e.localPosition.y}`))
      scene.add(new Camera2D({ position: v(3000, 2000) }))
    })
    g.tap(375 + 5, 667)
    expect(hits).toEqual(['3005,2000 5,0'])
    expect(g.tree.input.pointerPosition).toEqual(v(3005, 2000))
  })
})

describe('Camera2D 审查修复', () => {
  it('相机位置是真正的全局位置：挂在 scale.x = -1 的角色下面时局部位置镜像，offset 不镜像', async () => {
    let cam!: Camera2D
    await setup((scene) => {
      const player = scene.add(new Node2D({ position: v(1000, 500), scale: v(-1, 1) }))
      cam = player.add(new Camera2D({ position: v(40, 0), offset: v(0, -10) }))
    })
    expect(cam.screenCenter).toEqual(v(960, 490))
    expect(cam.screenCenter.x).toBeCloseTo(cam.globalPosition.x, 9)
  })

  it('读 screenCenter 不会提前用掉 resetSmoothing 的跳转', async () => {
    let cam!: Camera2D
    const g = await setup((scene) => {
      cam = scene.add(new Camera2D({ position: v(0, 0), positionSmoothingEnabled: true }))
    })
    cam.x = 1000
    cam.resetSmoothing()
    expect(cam.screenCenter.x).toBe(1000) // 此刻的目标
    cam.x = 3000
    g.step()
    expect(cam.screenCenter.x).toBe(3000) // 直接跳到新目标，不平滑
  })

  it('暂停时平滑停住', async () => {
    let cam!: Camera2D
    const g = await setup((scene) => {
      cam = scene.add(new Camera2D({ position: v(0, 0), positionSmoothingEnabled: true }))
    })
    cam.x = 1000
    g.step()
    const before = cam.screenCenter.x
    g.tree.paused = true
    g.stepSeconds(1)
    expect(cam.screenCenter.x).toBe(before)
    g.tree.paused = false
    g.step()
    expect(cam.screenCenter.x).toBeGreaterThan(before)
  })

  it('手指按住不动、相机移动时，按下的指针换算成新的世界坐标', async () => {
    let cam!: Camera2D
    const g = await setup((scene) => {
      cam = scene.add(new Camera2D({ position: v(1000, 667) }))
    })
    g.pointerDown(375, 667, 7)
    g.step()
    expect(g.tree.input.pressedPointers.get(7)).toEqual(v(1000, 667))
    cam.x = 1200
    g.step() // 相机在这一帧末尾移动
    g.step() // 下一帧开始时刷新
    expect(g.tree.input.pressedPointers.get(7)).toEqual(v(1200, 667))
    expect(g.tree.input.pointerPosition).toEqual(v(1200, 667))
  })
})

describe('Camera2D 渲染', () => {
  it('世界容器按相机平移；TileMapLayer 只显示相机可见范围内的区块', async () => {
    const tiles = tileset('cam-tiles.png', { tileSize: 16 })
    tiles.texture._setLoaded({}, 64, 32)
    let layer!: TileMapLayer
    let cam!: Camera2D
    const g = await setup((scene) => {
      layer = scene.add(new TileMapLayer({ tileSet: tiles, width: 512, height: 16, cells: new Array<number>(512 * 16).fill(1) }))
      cam = scene.add(new Camera2D({ position: v(3000, 128) }))
    })
    const r = PixiRenderer._createForSyncTests()
    r.sync(g.tree)
    expect([r._stage.x, r._stage.y]).toEqual([375 - 3000, 667 - 128])
    const visible = () => ((layer.unsafePixi as Container).children[0] as Container).children.filter((m) => m.visible).map((m) => m.x / 256)
    expect(visible()).toEqual([10, 11, 12, 13]) // 世界 x 2625..3375
    cam.x = 600
    g.step()
    r.sync(g.tree)
    expect(visible()).toEqual([0, 1, 2, 3]) // 世界 x 225..975
  })

  it('像素风时相机平移对齐到物理像素', async () => {
    const g = await setup((scene) => scene.add(new Camera2D({ position: v(1000.3, 500.6) })))
    g.setScreen({ width: 375, height: 667, pixelRatio: 2 }) // 缩放 0.5，渲染分辨率 2：1 设计像素 = 1 物理像素
    g.step()
    const r = PixiRenderer._createForSyncTests({ pixelArt: true })
    r.sync(g.tree)
    expect([r._stage.x, r._stage.y]).toEqual([Math.round(375 - 1000.3), Math.round(667 - 500.6)])
    const plain = PixiRenderer._createForSyncTests()
    plain.sync(g.tree)
    expect(plain._stage.x).toBeCloseTo(375 - 1000.3, 9)
  })
})
