import { startGame } from 'sapling2d/browser'
import { gameOptions } from './game'

const game = await startGame(gameOptions)
Object.assign(globalThis, { sapling: game })
