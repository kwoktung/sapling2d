import { startLogServer } from 'sapling2d/vite'

startLogServer({ port: 7777, file: 'logs/wechat.jsonl' })
console.log('log server on :7777 (logs/wechat.jsonl)')
