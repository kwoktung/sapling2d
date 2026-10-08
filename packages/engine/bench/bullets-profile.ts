/**
 * 弹幕场景的剖析工具，真机（spikes/bullets/src/main.wechat.ts）和 Node（bullets-profile.bench.test.ts）共用：
 *
 * - `instrument()`：包住每帧会调用的引擎方法，按阶段累计耗时。包装本身有开销（每次调用两次 clock），
 *   所以要和不包装的基线一起看；`calls` 用来估算这部分开销（次数 × clock 耗时）。
 * - `micro()`：逐项测量基本操作的单次耗时（纳秒），对比真机和 Node `--jitless`，找出在真机上格外慢的操作。
 */
import { Container } from 'pixi.js'
import { Node2D, Sprite2D, Tween, v, Vector2, type SceneTree } from 'sapling2d'
import { PhysicsWorld } from '../src/physics/PhysicsWorld'
import type { PixiRenderer } from '../src/render/PixiRenderer'
import { Input } from '../src/core/Input'
import { SceneTree as SceneTreeClass } from '../src/core/SceneTree'
import { PixiRenderer as PixiRendererClass } from '../src/render/PixiRenderer'
import { Bullet, BulletStorm, Enemy, profiling } from './bullets-scene'

type Clock = () => number
type AnyFn = (...args: unknown[]) => unknown

export interface Instrumented {
  /** 阶段 → 累计毫秒。 */
  times: Record<string, number>
  /** 阶段 → 调用次数。 */
  calls: Record<string, number>
  reset(): void
  restore(): void
}

/** 包装的方法：[原型, 方法名, 阶段名]。 */
function targets(): [object, string, string][] {
  return [
    [Input.prototype, '_flush', 'input'],
    [SceneTreeClass.prototype, '_snapshot', 'tree.snapshot'],
    [PhysicsWorld.prototype, '_step', 'physics.step'],
    [BulletStorm.prototype, 'process', 'scene.process'],
    [Bullet.prototype, 'process', 'bullet.process'],
    [Enemy.prototype, 'process', 'enemy.process'],
    [Tween.prototype, '_advance', 'tween.advance'],
    [SceneTreeClass.prototype, '_flushFrameEnd', 'tree.frameEnd'],
    [PixiRendererClass.prototype, '_syncNode', 'sync.node'],
    [PixiRendererClass.prototype, '_releaseUnloadedTextures', 'sync.releaseTextures'],
  ]
}

export function instrument(clock: Clock): Instrumented {
  const times: Record<string, number> = {}
  const calls: Record<string, number> = {}
  const originals: [Record<string, AnyFn>, string, AnyFn][] = []
  for (const [proto, method, phase] of targets()) {
    const p = proto as Record<string, AnyFn>
    const original = p[method]
    if (typeof original !== 'function') throw new Error(`instrument: ${phase} (${method}) not found`)
    originals.push([p, method, original])
    times[phase] = 0
    calls[phase] = 0
    p[method] = function (this: unknown, ...args: unknown[]) {
      const t = clock()
      try {
        return original.apply(this, args)
      } finally {
        times[phase]! += clock() - t
        calls[phase]!++
      }
    }
  }
  profiling.clock = clock
  return {
    times,
    calls,
    reset() {
      for (const k of Object.keys(times)) {
        times[k] = 0
        calls[k] = 0
      }
      profiling.sceneTimes = { filter: 0, spawn: 0, collide: 0 }
    },
    restore() {
      for (const [p, method, original] of originals) p[method] = original
      profiling.clock = null
    },
  }
}

/** 每帧平均：阶段 → 毫秒，以及每次调用的微秒（调用很多的阶段看它）。 */
export function perFrame(inst: Instrumented, frames: number): string[] {
  const rows: string[] = []
  const all = { ...inst.times, ...Object.fromEntries(Object.entries(profiling.sceneTimes).map(([k, t]) => [`  scene.${k}`, t])) }
  for (const [phase, t] of Object.entries(all)) {
    const calls = inst.calls[phase]
    const per = calls ? `  ${((t * 1000) / calls).toFixed(2).padStart(7)} µs/call × ${Math.round(calls / frames)}` : ''
    rows.push(`${phase.padEnd(24)} ${(t / frames).toFixed(2).padStart(6)} ms${per}`)
  }
  return rows
}

// ---------------------------------------------------------------- 微基准

let sink = 0

/** 自适应次数：每项至少跑 `minMs` 毫秒，返回每次操作的纳秒。 */
function measure(clock: Clock, run: (n: number) => void, minMs = 30): number {
  let n = 256
  for (;;) {
    const t = clock()
    run(n)
    const ms = clock() - t
    if (ms >= minMs || n > 1 << 26) return (ms * 1e6) / n
    n *= ms < 1 ? 8 : 2
  }
}

class Empty extends Node2D {
  override process() {}
}

/**
 * 在一棵已经跑起来的弹幕场景树上测基本操作。会修改节点位置（测完后场景状态已变，放在最后跑）。
 * 返回 [名字, 纳秒/次]。
 */
export function micro(clock: Clock, tree: SceneTree, renderer: PixiRenderer): [string, number][] {
  const nodes: Node2D[] = []
  const walk = (n: { children: readonly unknown[] }) => {
    for (const c of n.children) {
      if (c instanceof Node2D) nodes.push(c)
      walk(c as never)
    }
  }
  walk(tree.currentScene!)
  const count = nodes.length + 1
  const sprite = nodes.find((n) => n instanceof Sprite2D)!
  const empties = Array.from({ length: 500 }, () => new Empty())
  const obj = { x: 0, y: 0 }
  const vec = v(1, 2)
  const map = new Map(nodes.map((n, i) => [n, i]))
  const container = new Container()
  const t = tree as unknown as { _snapshot(): unknown[] }
  const out: [string, number][] = []
  const add = (name: string, ns: number) => out.push([name, ns])

  add('clock()', measure(clock, (n) => { for (let i = 0; i < n; i++) sink += clock() }))
  add('empty loop iteration', measure(clock, (n) => { for (let i = 0; i < n; i++) sink += i }))
  add('plain field read+write', measure(clock, (n) => { for (let i = 0; i < n; i++) obj.x = obj.x + 1 }))
  add('new Vector2', measure(clock, (n) => { for (let i = 0; i < n; i++) sink += new Vector2(i, i).x }))
  add('Node2D.x read (getter)', measure(clock, (n) => { for (let i = 0; i < n; i++) sink += sprite.x }))
  add('Node2D.x write (setter)', measure(clock, (n) => { for (let i = 0; i < n; i++) sprite.x = i & 1023 }))
  add('Node2D.position = vec', measure(clock, (n) => { for (let i = 0; i < n; i++) sprite.position = vec }))
  add('node.canProcess()', measure(clock, (n) => { for (let i = 0; i < n; i++) sink += sprite.canProcess() ? 1 : 0 }))
  add('virtual process() call', measure(clock, (n) => { for (let i = 0; i < n; i++) empties[i % 500]!.process() }))
  add('Map.get', measure(clock, (n) => { for (let i = 0; i < n; i++) sink += map.get(sprite) ?? 0 }))
  add('Pixi position.set+scale.set+rotation', measure(clock, (n) => {
    for (let i = 0; i < n; i++) {
      container.position.set(i & 1023, 3)
      container.scale.set(1, 1)
      container.rotation = 0
    }
  }))
  // 以下按“每个节点”折算
  add(`tree._snapshot() per node (${count})`, measure(clock, (n) => { for (let i = 0; i < Math.ceil(n / count); i++) sink += t._snapshot().length }))
  add(`sync per node, unchanged (${count})`, measure(clock, (n) => { for (let i = 0; i < Math.ceil(n / count); i++) renderer.sync(tree) }))
  add(`sync per node, all moved (${count})`, measure(clock, (n) => {
    for (let i = 0; i < Math.ceil(n / count); i++) {
      for (const node of nodes) node.x = node.x
      renderer.sync(tree)
    }
  }))
  return out
}

export function formatMicro(rows: [string, number][]): string[] {
  return rows.map(([name, ns]) => `${name.padEnd(40)} ${ns.toFixed(1).padStart(9)} ns`)
}
