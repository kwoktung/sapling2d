import { describe, expect, it } from 'vitest'
import { v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { gameOptions } from '../src/game'
import { Goomba } from '../src/nodes/Goomba'
import type { Level } from '../src/scenes/Level'
import { GameState } from '../src/state'
import { TILE_USED } from '../src/config'

// 地面顶部 y = 15 × 16 = 240；马里奥高 16，站在地上时 y = 232
const GROUND_Y = 240 - 8

async function start() {
  const g = await createTestGame({ ...gameOptions, seed: 1 })
  const level = () => g.scene as Level
  return { g, level, state: () => g.tree.autoload(GameState) }
}

describe('关卡', () => {
  it('从 Tiled 关卡创建：图块层、马里奥、敌人、金币、终点', async () => {
    const { g, level } = await start()
    const l = level()
    expect(g.scene.children.slice(0, 2).map((n) => n.name)).toEqual(['Background', 'Ground'])
    expect([l.goombas.length, l.coins.length, l.goalX]).toEqual([16, 7, 198 * 16])
    expect(l.time).toBe(300)
  })

  it('落地；按住右键跑，相机跟着向右卷动，不能走回画面左边', async () => {
    const { g, level } = await start()
    const m = level().mario
    g.stepSeconds(1)
    expect([m.isOnFloor, m.y]).toEqual([true, GROUND_Y])
    g.keyDown('ArrowRight')
    g.stepSeconds(2)
    g.keyUp('ArrowRight')
    expect(m.x).toBeGreaterThan(200)
    const left = g.tree.viewport.visibleWorldRect.left
    expect(left).toBeGreaterThan(0)
    g.keyDown('ArrowLeft')
    g.stepSeconds(4)
    expect(m.x - 6).toBeGreaterThanOrEqual(left - 0.001)
  })

  it('顶砖块：砖块碎掉；顶问号块：变成空块，金币 +1', async () => {
    const { g, level, state } = await start()
    const l = level()
    const m = l.mario
    for (const goomba of l.goombas) goomba.queueFree() // 第一个敌人就在旁边，别让它撞上来
    m.position = v(20 * 16 + 8, GROUND_Y) // 砖块 (20, 11) 正下方
    g.step(5)
    g.pressKey('Space')
    g.stepSeconds(1)
    expect(l.ground.getCell(20, 11)).toBe(0)
    m.position = v(21 * 16 + 8, GROUND_Y) // 问号块 (21, 11)
    g.step(5)
    g.pressKey('Space')
    g.stepSeconds(1)
    expect(l.ground.getCell(21, 11)).toBe(TILE_USED)
    expect(state().coins).toBe(1)
    expect(state().score).toBe(50 + 200)
  })

  it('从上面踩敌人：敌人扁掉，马里奥弹起，加分', async () => {
    const { g, level, state } = await start()
    const l = level()
    const goomba = l.goombas[0]!
    goomba.awake = false
    l.mario.position = v(goomba.x, goomba.y - 40) // 正上方，落下来
    g.stepSeconds(0.5)
    expect(goomba.dead).toBe(true)
    expect(l.mario.state).toBe('play')
    expect(state().score).toBe(100)
    g.stepSeconds(1)
    expect(l.goombas).not.toContain(goomba) // 过一会儿消失
  })

  it('从侧面碰到敌人：失去一条命，过一会儿重开这一关', async () => {
    const { g, level, state } = await start()
    const l = level()
    l.mario.position = v(100, GROUND_Y)
    const goomba = l.add(new Goomba(140, GROUND_Y))
    l.goombas.push(goomba)
    goomba.awake = true
    g.stepSeconds(1.5)
    expect(l.mario.state).toBe('dead')
    g.stepSeconds(3)
    await new Promise((r) => setTimeout(r, 0))
    expect(state().lives).toBe(2)
    expect((g.scene as Level).mario.state).toBe('play')
  })

  it('掉进坑里：失去一条命；没有命了从头开始', async () => {
    const { g, level, state } = await start()
    state().lives = 1
    state().score = 999
    level().mario.position = v(69 * 16 + 8, 100) // 第一个坑（69–70 列）
    g.stepSeconds(1)
    expect(level().mario.state).toBe('dead')
    g.stepSeconds(3)
    await new Promise((r) => setTimeout(r, 0))
    expect([state().lives, state().score]).toEqual([3, 0])
  })

  it('时间到：失去一条命', async () => {
    const { g, level } = await start()
    level().time = 1
    g.stepSeconds(0.5)
    expect(level().mario.state).toBe('dead')
  })

  it('走到终点：过关，剩余时间换分数；按跳跃键重新开始', async () => {
    const { g, level, state } = await start()
    const l = level()
    l.mario.position = v(l.goalX - 40, GROUND_Y) // 旗杆前的地面上：一直走会被旗杆底下的砖挡住，碰到就算
    l.time = 100
    g.keyDown('ArrowRight')
    g.stepSeconds(2)
    g.keyUp('ArrowRight')
    expect(l.mario.state).toBe('clear')
    expect(l.hud.message).toBe('COURSE CLEAR!')
    expect(state().score).toBe(100 * 50)
    g.pressKey('Space')
    await new Promise((r) => setTimeout(r, 0))
    expect((g.scene as Level).mario.state).toBe('play')
    expect(state().score).toBe(0)
  })

  it('屏幕按钮：按住“右”跑，按“跳”起跳', async () => {
    const { g, level } = await start()
    const l = level()
    g.stepSeconds(0.5)
    const right = l.controls.right.globalPosition
    const jump = l.controls.jump.globalPosition
    g.pointerDown(right.x, right.y, 1)
    g.stepSeconds(0.5)
    expect(l.mario.velocityX).toBeGreaterThan(0)
    g.pointerDown(jump.x, jump.y, 2)
    g.step(3)
    expect(l.mario.isOnFloor).toBe(false)
    g.pointerUp(jump.x, jump.y, 2)
    g.pointerUp(right.x, right.y, 1)
  })
})
