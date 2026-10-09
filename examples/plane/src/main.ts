import { startGame } from 'sapling2d/browser'
import { gameOptions } from './game'

const game = await startGame(gameOptions)
Object.assign(globalThis, { sapling: game }) // 在浏览器控制台里：sapling.tree.dump()
