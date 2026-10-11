// 局域网日志服务：node spikes/wechat-subpackage/log-server.ts → logs/wechat.jsonl
import { startLogServer } from '../../packages/engine/src/vite/index.ts'

startLogServer({ port: 7778, file: new URL('logs/wechat.jsonl', import.meta.url).pathname })
console.log('log server on :7778 (spikes/wechat-subpackage/logs/wechat.jsonl)')
