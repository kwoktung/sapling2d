import { describe, expect, it } from 'vitest'
import { v } from 'sapling2d'
import { createTestGame } from 'sapling2d/testing'
import { FIELD, ULT } from '../src/config'
import { gameOptions } from '../src/game'
import { linePath } from '../src/path'
import type { Battle } from '../src/scenes/Battle'

const played = (g: { audio: { log: readonly { path: string }[] } }) => g.audio.log.map((s) => s.path.replace(/^audio\/|\.mp3$/g, ''))

async function setup(seed = 3) {
  const g = await createTestGame({ ...gameOptions, seed })
  const battle = g.scene as Battle
  return { g, battle }
}

describe('音频', () => {
  it('进场开始循环播背景音乐；选英雄、射箭、命中、击杀都有音效', async () => {
    const { g, battle } = await setup()
    expect(g.audio.playing.find((s) => s.path === 'audio/bgm.mp3')?.loop).toBe(true)
    battle.startWith('archer', v(375, 740))
    battle.stopSpawning()
    battle.spawnEnemy('slime', linePath(375, 300, 100000), 1)
    g.stepSeconds(4) // 怪走进射程、箭飞到
    expect(played(g)).toEqual(expect.arrayContaining(['bgm', 'pick', 'shoot', 'arrow_hit', 'die']))
  })

  it('漏怪、升级、选卡、大招、Boss 出场、失败、再来一局', async () => {
    const { g, battle } = await setup()
    battle.startWith('archer', v(375, 740))
    battle.stopSpawning()
    battle.state = 'wave'
    battle.heroes[0]!.cooldown = 1e9
    battle.spawnEnemy('bat', linePath(100, FIELD.baseY - 10, FIELD.baseY + 200), 1e6)
    g.stepSeconds(1)
    battle.gainXp(1000)
    g.step()
    battle.picker!.cards[0]!.clicked.emit({ pointerId: 0, position: v(0, 0), localPosition: v(0, 0) })
    while (battle.picker) battle.picker.cards[0]!.clicked.emit({ pointerId: 0, position: v(0, 0), localPosition: v(0, 0) })
    battle.energy.archer = ULT.energyMax
    battle.arrowRain(375, 400)
    battle.spawnEnemy('slimeKing', linePath(375, 100, 100000))
    battle.loseLives(99)
    g.step()
    g.step()
    battle.restart()
    expect(played(g)).toEqual(expect.arrayContaining(['leak', 'level_up', 'pick', 'ult_archer', 'boss', 'lose', 'button']))
    expect(g.audio.log.find((s) => s.path === 'audio/bgm.mp3')).toBeDefined()
  })

  it('同一帧大量命中：同一个音效最多同时播几个', async () => {
    const { g, battle } = await setup()
    battle.startWith('archer', v(375, 740))
    battle.stopSpawning()
    const enemies = Array.from({ length: 30 }, (_, i) => battle.spawnEnemy('slime', linePath(60 + i * 20, 400, 100000), 1))
    for (const e of enemies) battle.damage(e, 10)
    expect(g.audio.playing.filter((s) => s.path === 'audio/die.mp3').length).toBe(4)
  })

  it('右上角的开关：关掉音乐 / 音效（总线静音），存进存档，下一局还是关的', async () => {
    const { g, battle } = await setup()
    battle.hud.musicToggle.clicked.emit({ pointerId: 0, position: v(0, 0), localPosition: v(0, 0) })
    expect([g.tree.audio.isBusMuted('Music'), g.tree.audio.isBusMuted('SFX'), battle.hud.musicToggle.text]).toEqual([true, false, '音乐 关'])
    battle.hud.sfxToggle.clicked.emit({ pointerId: 0, position: v(0, 0), localPosition: v(0, 0) })
    expect(g.tree.storage.get('sfxMuted', false)).toBe(true)
    battle.restart()
    for (let i = 0; i < 20 && g.scene === battle; i++) await new Promise((r) => setTimeout(r, 0))
    const next = g.scene as Battle
    expect([g.tree.audio.isBusMuted('Music'), g.tree.audio.isBusMuted('SFX'), next.hud.sfxToggle.text]).toEqual([true, true, '音效 关'])
    next.hud.musicToggle.clicked.emit({ pointerId: 0, position: v(0, 0), localPosition: v(0, 0) })
    expect(g.tree.audio.isBusMuted('Music')).toBe(false)
  })
})
