import type { Game } from 'sapling2d'
import { snapshot } from 'sapling2d/wechat'
import { linePath } from './path'
import { Battle } from './scenes/Battle'

const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000))

/**
 * 真机上看一眼叠加发光和闪白（VITE_VERIFY=1）：摆好一个固定的画面、停住时间，截图发到 log server（logs/ 下的 PNG）。
 * 第二排英雄从左到右：弓手全白、法师停在出手帧全白、剑士半强度红色、剑士不闪（对照）。
 * 第一排怪物：全白、半白、不闪；两团爆炸光圈（叠加）：一团压在怪物上，一团在空地上。
 */
export async function runVerify(game: Game): Promise<void> {
  const battle = game.tree.currentScene
  if (!(battle instanceof Battle)) return
  battle.stopSpawning()
  battle.gold = 1e6
  for (const [i, kind] of [[4, 'archer'], [5, 'mage'], [6, 'knight'], [7, 'knight']] as const) battle.placeHero(battle.slots[i]!, kind)
  const enemies = [150, 300, 450].map((x) => battle.spawnEnemy(linePath(x, 560, 3000), 1e6, 0))
  await wait(1.5)
  game.tree.timeScale = 0
  const [archer, mage, knight] = battle.heroes
  mage!.sprite.play('attack')
  mage!.sprite.frame = 2
  knight!.sprite.play('attack')
  knight!.sprite.frame = 1
  archer!.sprite.flash = 1
  mage!.sprite.flash = 1
  knight!.sprite.flash = 0.5
  knight!.sprite.flashColor = 0xff3030
  enemies[0]!.body.flash = 1
  enemies[1]!.body.flash = 0.5
  game.tree.timeScale = 1
  battle.burst(450, 560, 90)
  battle.burst(600, 1000, 90)
  await wait(0.08)
  game.tree.timeScale = 0
  await wait(0.5)
  snapshot('verify-flash-additive')
  console.log('[verify] done')
}
