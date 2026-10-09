/**
 * KnifeCollider 每步耗时。20 个角色挤在一起（刀圈两两交叉），刀圈反向旋转、角色来回移动；
 * 回调什么都不做（刀不会被打飞，一直是最坏情况）。
 *
 * 运行：pnpm bench          （有 JIT）
 *      pnpm bench:jitless  （无 JIT，近似 iOS 小游戏）
 *
 * 不做断言：耗时依赖机器。
 */
import { it } from 'vitest'
import { KnifeCollider, type RingBody } from '../src/KnifeCollider'

const TAU = Math.PI * 2
const DT = 1 / 60
const WARMUP = 60
const STEPS = 600

type Ring = { -readonly [K in keyof RingBody]: RingBody[K] }

function run(rings: number, knivesEach: number, spin: number): string {
  const radius = Math.max(78, (knivesEach * 26) / TAU)
  const list: Ring[] = []
  for (let i = 0; i < rings; i++) {
    const x = (i % 5) * radius * 1.6
    const y = Math.floor(i / 5) * radius * 1.6
    list.push({ x, y, prevX: x, prevY: y, ringAngle: i, prevAngle: i, ringRadius: radius, knifeCount: knivesEach, bodyRadius: 36 })
  }
  const collider = new KnifeCollider({ knifeLength: 60, knifeWidth: 12 })
  let clashes = 0
  let hits = 0
  const onClash = () => void clashes++
  const onHit = () => void hits++
  let time = 0
  let max = 0
  let substeps = 0
  for (let s = 0; s < WARMUP + STEPS; s++) {
    for (let i = 0; i < list.length; i++) {
      const r = list[i]!
      r.prevX = r.x
      r.prevY = r.y
      r.prevAngle = r.ringAngle
      r.ringAngle += (i % 2 ? -spin : spin) * DT
      r.x += Math.sin(s * 0.05 + i) * 360 * DT
      r.y += Math.cos(s * 0.05 + i) * 360 * DT
    }
    const t0 = performance.now()
    collider.detect(list, onClash, onHit)
    const t = performance.now() - t0
    if (s < WARMUP) continue
    time += t
    if (t > max) max = t
    substeps += collider.substeps
  }
  const total = WARMUP + STEPS
  return (
    `${String(rings * knivesEach).padStart(5)} | ${String(spin).padStart(4)} | ${(time / STEPS).toFixed(3).padStart(7)} ${max.toFixed(3).padStart(7)} | ` +
    `${(substeps / STEPS).toFixed(1).padStart(5)} | ${(clashes / total).toFixed(1).padStart(6)} ${(hits / total).toFixed(1).padStart(6)}`
  )
}

it('KnifeCollider：每步耗时', () => {
  const rows = [`KnifeCollider（20 个角色，${process.execArgv.includes('--jitless') ? '无 JIT' : '有 JIT'}）`, 'knives | spin |  avg ms  max ms | 子步 |  碰刀/步 砍身体/步']
  rows.push(run(20, 8, 3.5)) // 160 把
  rows.push(run(20, 8, 7)) // 转速加倍
  rows.push(run(20, 25, 3.5)) // 500 把
  console.log(rows.join('\n'))
})
