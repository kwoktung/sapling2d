import { startGame } from 'sapling2d/browser'
import { gameOptions } from './game'

const game = await startGame(gameOptions)
// 方便在浏览器控制台里观察：sapling.tree.dump()
Object.assign(globalThis, { sapling: game })
