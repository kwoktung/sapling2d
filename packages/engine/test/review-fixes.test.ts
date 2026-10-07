// 代码审查发现的问题的回归测试
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { circle, CollisionShape2D, Node, Node2D, rect, RigidBody2D, Scene, Signal, Sprite2D, tex, v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { startLogServer } from 'sapling2d/vite'
import { PixiRenderer } from '../src/render/PixiRenderer'

describe('瞬移之后设置速度 / 冲量', () => {
  async function setup() {
    const g = await createTestGame({ main: Scene, physics: { gravity: v(0, 0) } })
    const ball = g.scene.add(new RigidBody2D({ position: v(100, 100) }))
    ball.add(new CollisionShape2D({ shape: circle(10) }))
    g.step() // 刚体已创建
    return { g, ball }
  }

  it('先瞬移再设线速度：速度保留，从新位置出发', async () => {
    const { g, ball } = await setup()
    ball.position = v(400, 400)
    ball.linearVelocity = v(0, -600)
    g.step()
    expect(ball.x).toBeCloseTo(400)
    expect(ball.y).toBeCloseTo(390)
    expect(ball.linearVelocity.y).toBeCloseTo(-600)
  })

  it('先瞬移再施加冲量：冲量生效', async () => {
    const { g, ball } = await setup()
    ball.linearVelocity = v(300, 0)
    g.step()
    ball.position = v(200, 200) // 瞬移清零旧速度
    ball.applyCentralImpulse(v(0, 120)) // 质量 1：Δv = 120
    g.step()
    expect(ball.linearVelocity.x).toBeCloseTo(0)
    expect(ball.linearVelocity.y).toBeCloseTo(120)
  })
})

describe('缩放为 0 的节点', () => {
  it('不会被点中，也不会吞掉其他节点和动作的点击', async () => {
    const g = await createTestGame({ main: Scene })
    const hidden = g.scene.add(new Node2D({ position: v(375, 667), inputPickable: true, hitArea: rect(-170, -60, 340, 120), scale: v(0, 0), zIndex: 10 }))
    const target = g.scene.add(new Node2D({ position: v(100, 100), inputPickable: true, hitArea: rect(-50, -50, 100, 100) }))
    let hiddenClicks = 0
    let targetClicks = 0
    hidden.clicked.connect(() => hiddenClicks++)
    target.clicked.connect(() => targetClicks++)
    g.tap(100, 100)
    g.tap(375, 667)
    expect([hiddenClicks, targetClicks]).toEqual([0, 1])
  })

  it('父节点缩放为 0 时，子刚体不会被拉到父节点原点', async () => {
    const g = await createTestGame({ main: Scene, physics: { gravity: v(0, 0) } })
    const parent = g.scene.add(new Node2D({ position: v(300, 300) }))
    const ball = parent.add(new RigidBody2D({ position: v(50, 0), linearVelocity: v(60, 0) }))
    ball.add(new CollisionShape2D({ shape: circle(10) }))
    g.step(2)
    parent.scale = v(0, 0)
    g.step(2)
    expect(ball.x).toBeGreaterThan(50) // 保持最后一次有效的局部位置，而不是 (0, 0)
  })
})

describe('Signal', () => {
  it('同一次 emit 中被前一个监听断开的 once 监听不会执行', () => {
    const s = new Signal()
    const calls: string[] = []
    const second = () => calls.push('second')
    s.connect(() => {
      calls.push('first')
      s.disconnect(second)
    })
    s.once(second)
    s.emit()
    expect(calls).toEqual(['first'])
  })

  it('同一次 emit 中 owner 被销毁的 once 监听不会执行', async () => {
    const g = await createTestGame({ main: Scene })
    const owner = g.scene.add(new Node2D({ name: 'Owner' }))
    const s = new Signal()
    const calls: string[] = []
    s.connect(() => owner._free())
    s.once(() => calls.push(`owner in tree: ${owner.isInsideTree}`), owner)
    s.emit()
    expect(calls).toEqual([])
  })

  it('once 触发、手动断开后，owner 不再记住这些连接（常驻节点不泄漏）', async () => {
    const g = await createTestGame({ main: Scene })
    const keeper = g.scene.add(new Node({ name: 'Keeper' }))
    for (let i = 0; i < 50; i++) {
      g.tree.createTimer(0.01).timeout.once(() => {}, keeper)
      const off = new Signal().connect(() => {}, keeper)
      off()
    }
    g.step(2)
    expect(keeper._connectionCount).toBe(0)
  })
})

describe('切换场景卸载贴图时释放显存', () => {
  it('资源被卸载后，下一次同步就销毁对应的 Pixi 贴图（不等有人再用它）', async () => {
    const g = await createTestGame({ main: Scene })
    const r = PixiRenderer._createForSyncTests()
    const t = tex('review-gpu.png')
    t._setLoaded({ width: 4, height: 4 }, 4, 4) // 假图片对象：同步阶段不会上传到 GPU
    const sprite = g.scene.add(new Sprite2D({ texture: t }))
    r.sync(g.tree)
    expect(r._textureCount).toBe(1)

    sprite.queueFree()
    g.step()
    t._unload() // 等同于切换场景时的卸载
    r.sync(g.tree)
    expect(r._textureCount).toBe(0)
  })
})

describe('局域网日志服务', () => {
  let dir = ''
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))

  it('截图的 label 不能把文件写到日志目录之外', async () => {
    dir = mkdtempSync(join(tmpdir(), 'sapling-logs-'))
    const logs = join(dir, 'logs')
    const server = startLogServer({ port: 0, host: '127.0.0.1', file: join(logs, 'wechat.jsonl'), onLog: () => {} })
    await new Promise((r) => server.once('listening', r))
    const { port } = server.address() as AddressInfo
    const post = (body: unknown) => fetch(`http://127.0.0.1:${port}/log`, { method: 'POST', body: JSON.stringify(body) })
    const png = 'data:image/png;base64,' + Buffer.from('png').toString('base64')
    await post({ tag: 'snapshot', t: 1, data: { label: '../../escape', dataUrl: png } })
    await post({ tag: 'snapshot', t: '2/../../x', data: { label: 'ok', dataUrl: png } })
    server.close()
    expect(readdirSync(dir).sort()).toEqual(['logs']) // 没有文件逃出 logs/
    const files = readdirSync(logs).filter((f) => f.endsWith('.png')).sort()
    expect(files).toHaveLength(2)
    expect(files.every((f) => /^[\w-]+\.png$/.test(f))).toBe(true)
  })
})
